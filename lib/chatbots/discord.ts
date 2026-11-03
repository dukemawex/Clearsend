import * as core from "./core";
import type { Ctx, IncomingDoc, Reply } from "./core";
import { logActivity, once, rateLimit, k } from "./store";
import { MAX_UPLOAD_BYTES } from "@/lib/documents";
import commandDefs from "./discord-commands.json";

export const InteractionType = { PING: 1, COMMAND: 2, COMPONENT: 3, MODAL_SUBMIT: 5 } as const;
export const ResponseType = { PONG: 1, MESSAGE: 4, DEFERRED: 5, MODAL: 9 } as const;
const EPHEMERAL = 64;

type DUser = { id: string; username?: string; global_name?: string | null };
type Opt = { name: string; type: number; value?: string | number; options?: Opt[] };
export type Interaction = {
  id: string; type: number; token: string; application_id: string; guild_id?: string; channel_id?: string; channel?: { id: string };
  member?: { user: DUser }; user?: DUser;
  data?: { name?: string; options?: Opt[]; custom_id?: string; resolved?: { attachments?: Record<string, { url: string; filename: string; content_type?: string; size: number }> }; components?: Array<{ components: Array<{ custom_id: string; value: string }> }> };
};
export type DiscordResult = { body: Record<string, unknown>; after?: () => Promise<void> };

const STYLE = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;
function components(r: Reply) {
  if (!r.buttons?.length) return [];
  const rows = [];
  for (let i = 0; i < r.buttons.length && rows.length < 5; i += 5) {
    rows.push({ type: 1, components: r.buttons.slice(i, i + 5).map((b) => b.url ? { type: 2, style: 5, label: b.label.slice(0, 80), url: b.url } : { type: 2, style: STYLE[b.style ?? "secondary"], label: b.label.slice(0, 80), custom_id: b.id }) });
  }
  return rows;
}
const message = (r: Reply) => ({ content: r.text.slice(0, 1900), components: components(r), flags: r.ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } });

async function webhook(appId: string, token: string, method: "POST" | "PATCH", path: string, body: unknown) {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) console.warn("discord_webhook_error", { status: res.status, path });
}
const followDm = (i: Interaction, r: Reply) => async () => { if (r.dm) await webhook(i.application_id, i.token, "POST", "", { ...message({ text: r.dm.text, buttons: r.dm.buttons }), flags: EPHEMERAL }); };

function ctxOf(i: Interaction): Ctx {
  const u = i.member?.user ?? i.user ?? { id: "unknown" };
  return { platform: "discord", chatId: i.channel_id ?? i.channel?.id ?? `dm:${u.id}`, userId: u.id, userName: u.global_name || u.username || `user ${u.id}`, isGroup: !!i.guild_id };
}

function opts(list?: Opt[]): Record<string, string | number | undefined> {
  return Object.fromEntries((list ?? []).map((o) => [o.name, o.value]));
}

async function fetchAttachment(i: Interaction, id?: string | number): Promise<IncomingDoc | undefined> {
  if (!id) return undefined;
  const a = i.data?.resolved?.attachments?.[String(id)];
  if (!a) return undefined;
  if (a.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 5 MB.");
  const host = new URL(a.url).hostname;
  if (!/(^|\.)discordapp\.(com|net)$/.test(host) && !/(^|\.)discord\.com$/.test(host)) throw new Error("Unexpected attachment host.");
  const res = await fetch(a.url, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't download the attachment.");
  return { name: a.filename, mime: a.content_type?.split(";")[0] ?? "application/octet-stream", bytes: await res.arrayBuffer() };
}

/** Answer within ~2.2s if possible; otherwise defer and edit the original message later. */
async function raceOrDefer(i: Interaction, work: Promise<Reply>, deferEphemeral = false): Promise<DiscordResult> {
  const quick = await Promise.race([work.then((r) => ({ r })), new Promise<null>((res) => setTimeout(() => res(null), 2200))]);
  if (quick) return { body: { type: ResponseType.MESSAGE, data: message(quick.r) }, after: followDm(i, quick.r) };
  return {
    body: { type: ResponseType.DEFERRED, data: { flags: deferEphemeral ? EPHEMERAL : 0 } },
    after: async () => {
      let r: Reply;
      try { r = await work; } catch (e) { r = { text: `Error: ${core.errMsg(e)}` }; }
      const { flags: _f, ...m } = message(r); void _f;
      await webhook(i.application_id, i.token, "PATCH", "/messages/@original", m);
      await followDm(i, r)();
    },
  };
}

const safe = (p: () => Promise<Reply>): Promise<Reply> => p().catch((e) => ({ text: `Error: ${core.errMsg(e)}`, ephemeral: true }));

export async function handleInteraction(i: Interaction): Promise<DiscordResult> {
  if (i.type === InteractionType.PING) return { body: { type: ResponseType.PONG } };
  const ctx = ctxOf(i);
  if (!(await once(k("idem", "dc", i.id), 86400))) return { body: { type: ResponseType.MESSAGE, data: { content: "Already handled.", flags: EPHEMERAL } } };
  if (!(await rateLimit(`dc:${ctx.userId}`))) return { body: { type: ResponseType.MESSAGE, data: { content: "Slow down a little; try again in a minute.", flags: EPHEMERAL } } };

  if (i.type === InteractionType.COMMAND) {
    const name = i.data?.name;
    if (name === "quote") { const o = opts(i.data?.options); return raceOrDefer(i, safe(() => core.quote(`${o.amount} ${o.from} ${o.to}`))); }
    if (name !== "escrow") return { body: { type: ResponseType.MESSAGE, data: { content: "Unknown command.", flags: EPHEMERAL } } };
    const sub = i.data?.options?.[0];
    const o = opts(sub?.options);
    const id = typeof o.id === "string" ? o.id : undefined;
    await logActivity({ platform: "discord", chatId: ctx.chatId, userId: ctx.userId, action: `cmd:${sub?.name}`, ok: true });
    switch (sub?.name) {
      case "help": return { body: { type: ResponseType.MESSAGE, data: message({ ...core.help("discord"), ephemeral: true }) } };
      case "create": return raceOrDefer(i, safe(() => core.createFromFields(ctx, { amount: Number(o.amount), currency: String(o.currency ?? "").toUpperCase().slice(0, 3), recipient: String(o.recipient ?? "").slice(0, 80), recipientEmail: String(o.recipient_email ?? "").toLowerCase(), recipientCountry: String(o.country ?? ""), specification: String(o.spec ?? "").slice(0, 2000), payerEmail: String(o.payer_email ?? "").toLowerCase() })));
      case "join": return raceOrDefer(i, safe(() => core.join(ctx, String(o.code ?? ""))));
      case "status": return raceOrDefer(i, safe(() => core.status(ctx, id)));
      case "fund": return raceOrDefer(i, safe(() => core.fund(ctx, id)));
      case "submit": return raceOrDefer(i, safe(async () => core.submit(ctx, id, String(o.text ?? ""), await fetchAttachment(i, o.file))));
      case "verify": return raceOrDefer(i, safe(() => core.verify(ctx, id)));
      case "release": return raceOrDefer(i, safe(() => core.requestRelease(ctx, id)));
      case "refund": return raceOrDefer(i, safe(() => core.requestRefund(ctx, id)));
      default: return { body: { type: ResponseType.MESSAGE, data: { content: "Unknown subcommand.", flags: EPHEMERAL } } };
    }
  }

  if (i.type === InteractionType.COMPONENT) {
    const cid = i.data?.custom_id ?? "";
    if (cid.startsWith("c:")) {
      const nonce = cid.slice(2);
      const r = await safe(() => core.pressConfirm(ctx, nonce)) as Reply & { needPhrase?: { nonce: string; phrase: string } };
      if (r.needPhrase) {
        return { body: { type: ResponseType.MODAL, data: { custom_id: `p:${nonce}`, title: "Confirm with typed words", components: [{ type: 1, components: [{ type: 4, custom_id: "phrase", style: 1, label: `Type: ${r.needPhrase.phrase}`.slice(0, 45), placeholder: r.needPhrase.phrase, required: true, max_length: 60 }] }] } } };
      }
      return raceOrDefer(i, Promise.resolve(r));
    }
    const m = /^act:(\w+):(escrow_\w+)$/.exec(cid);
    if (m) return raceOrDefer(i, safe(() => core.pressAction(ctx, m[1], m[2])));
    return { body: { type: ResponseType.MESSAGE, data: { content: "Unknown button.", flags: EPHEMERAL } } };
  }

  if (i.type === InteractionType.MODAL_SUBMIT) {
    const cid = i.data?.custom_id ?? "";
    const typed = i.data?.components?.[0]?.components?.[0]?.value ?? "";
    if (cid.startsWith("p:")) return raceOrDefer(i, safe(() => core.submitPhrase(ctx, cid.slice(2), typed)));
  }
  return { body: { type: ResponseType.MESSAGE, data: { content: "Unsupported interaction.", flags: EPHEMERAL } } };
}

/** Slash command definitions (registered by scripts/discord-register-commands.mjs). */
export const DISCORD_COMMANDS = commandDefs;

/** Bot permissions: Send Messages, Embed Links, Attach Files, Read Message History, Use Application Commands. */
export const DISCORD_PERMISSIONS = String(2048 + 16384 + 32768 + 65536 + 2147483648);
export function discordInviteUrl(appId: string) {
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(appId)}&scope=bot%20applications.commands&permissions=${DISCORD_PERMISSIONS}`;
}

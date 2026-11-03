import * as core from "./core";
import type { Ctx, IncomingDoc, Reply } from "./core";
import { parseCommand, isEscrowId } from "./parse";
import { logActivity, once, rateLimit, k } from "./store";
import { MAX_UPLOAD_BYTES } from "@/lib/documents";

type TgUser = { id: number; first_name?: string; username?: string; is_bot?: boolean };
type TgChat = { id: number; type: "private" | "group" | "supergroup" | "channel" };
type TgDoc = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
type TgMessage = { message_id: number; from?: TgUser; chat: TgChat; text?: string; caption?: string; document?: TgDoc; photo?: Array<TgDoc & { width: number }>; reply_to_message?: TgMessage };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string } };

const token = () => process.env.TELEGRAM_BOT_TOKEN;

export async function tg(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const t = token();
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) console.warn("telegram_api_error", { method, description: data.description?.slice(0, 120) });
  return data;
}

function markup(r: Reply) {
  if (r.forceReply) return { force_reply: true, selective: true };
  if (!r.buttons?.length) return undefined;
  return { inline_keyboard: r.buttons.map((b) => [b.url ? { text: b.label, url: b.url } : { text: b.label, callback_data: b.id }]) };
}

async function send(ctx: Ctx, r: Reply, replyTo?: number) {
  const chatId = ctx.chatId;
  await tg("sendMessage", { chat_id: chatId, text: r.text.slice(0, 4000), reply_markup: markup(r), disable_web_page_preview: true, ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}) });
  if (r.dm) {
    const dm = await tg("sendMessage", { chat_id: Number(ctx.userId), text: r.dm.text.slice(0, 4000), reply_markup: markup({ text: "", buttons: r.dm.buttons }), disable_web_page_preview: true });
    if (!dm.ok && chatId !== ctx.userId) {
      // User hasn't opened a DM with the bot: fall back to the group, without private links.
      const publicButtons = r.dm.buttons?.filter((b) => b.url && b.url.includes("paypal.com"));
      if (publicButtons?.length) await tg("sendMessage", { chat_id: chatId, text: "I couldn't DM you (open a private chat with me and press Start). PayPal sandbox approval link:", reply_markup: markup({ text: "", buttons: publicButtons }) });
      else await tg("sendMessage", { chat_id: chatId, text: "I have a private link for you. Open a private chat with me and press Start, then run the command again." });
    }
  }
}

function ctxOf(from: TgUser, chat: TgChat): Ctx {
  return { platform: "telegram", chatId: String(chat.id), userId: String(from.id), userName: from.username ? `@${from.username}` : (from.first_name ?? `user ${from.id}`), isGroup: chat.type !== "private" };
}

async function downloadDoc(msg: TgMessage | undefined): Promise<IncomingDoc | undefined> {
  if (!msg) return undefined;
  const d = msg.document ?? (msg.photo?.length ? { ...msg.photo[msg.photo.length - 1], file_name: "photo.jpg", mime_type: "image/jpeg" } : undefined);
  if (!d) return undefined;
  if (d.file_size && d.file_size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 5 MB.");
  const f = await tg("getFile", { file_id: d.file_id });
  const path = (f.result as { file_path?: string } | undefined)?.file_path;
  if (!path) throw new Error("Telegram didn't return the file.");
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't download the file from Telegram.");
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("File is larger than 5 MB.");
  return { name: d.file_name ?? "document", mime: d.mime_type ?? "application/octet-stream", bytes };
}

function splitId(args: string): { id?: string; rest: string } {
  const [first, ...rest] = args.split(/\s+/);
  return first && isEscrowId(first) ? { id: first, rest: rest.join(" ") } : { rest: args };
}

/** Returns a deferred task to run after the HTTP response (for slow AI verification), or undefined. */
export async function handleUpdate(update: TgUpdate): Promise<(() => Promise<void>) | undefined> {
  if (!(await once(k("idem", "tg", update.update_id), 86400))) return undefined; // Telegram retry

  const cb = update.callback_query;
  if (cb) {
    if (!cb.message) return undefined;
    const ctx = ctxOf(cb.from, cb.message.chat);
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    if (!(await rateLimit(`tg:${ctx.userId}`))) return undefined;
    const data = cb.data ?? "";
    try {
      if (data.startsWith("c:")) { await send(ctx, await core.pressConfirm(ctx, data.slice(2))); return undefined; }
      const m = /^act:(\w+):(escrow_\w+)$/.exec(data);
      if (m) {
        if (m[1] === "verify") { await send(ctx, { text: "Running the AI verifier (free OpenRouter model). This can take up to a minute…" }); return async () => send(ctx, await core.verify(ctx, m[2])); }
        await send(ctx, await core.pressAction(ctx, m[1], m[2]));
      }
    } catch (e) { await send(ctx, { text: `Error: ${core.errMsg(e)}` }); }
    return undefined;
  }

  const msg = update.message;
  if (!msg?.from || msg.from.is_bot) return undefined;
  const ctx = ctxOf(msg.from, msg.chat);
  const text = (msg.text ?? msg.caption ?? "").trim();
  const parsed = parseCommand(text, process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);

  if (!(await rateLimit(`tg:${ctx.userId}`))) {
    if (parsed) await send(ctx, { text: "Slow down a little; try again in a minute." }, msg.message_id);
    return undefined;
  }

  try {
    if (!parsed) {
      if (!text) return undefined;
      const nonce = await core.awaitingPhrase(ctx);
      if (nonce) { await send(ctx, await core.submitPhrase(ctx, nonce, text), msg.message_id); return undefined; }
      if (await core.hasDraft(ctx)) { await send(ctx, await core.answerDraft(ctx, text), msg.message_id); return undefined; }
      return undefined; // ordinary group chatter
    }
    const { cmd, args } = parsed;
    let reply: Reply | undefined;
    switch (cmd) {
      case "start":
        reply = args ? await core.join(ctx, args) : core.help("telegram"); break;
      case "help": reply = core.help("telegram"); break;
      case "escrow": reply = await core.startCreate(ctx, args); break;
      case "cancel": reply = await core.answerDraft(ctx, "cancel"); break;
      case "join": reply = await core.join(ctx, args); break;
      case "status": reply = await core.status(ctx, args || undefined); break;
      case "fund": reply = await core.fund(ctx, args || undefined); break;
      case "submit": {
        const { id, rest } = splitId(args);
        const doc = (await downloadDoc(msg)) ?? (await downloadDoc(msg.reply_to_message));
        const replyText = !rest && !doc && msg.reply_to_message?.text ? msg.reply_to_message.text : rest;
        reply = await core.submit(ctx, id, replyText, doc); break;
      }
      case "verify":
        await send(ctx, { text: "Running the AI verifier (free OpenRouter model). This can take up to a minute…" }, msg.message_id);
        return async () => send(ctx, await core.verify(ctx, args || undefined));
      case "release": reply = await core.requestRelease(ctx, args || undefined); break;
      case "refund": reply = await core.requestRefund(ctx, args || undefined); break;
      case "quote": reply = await core.quote(args); break;
      default: return undefined;
    }
    await logActivity({ platform: "telegram", chatId: ctx.chatId, userId: ctx.userId, action: `cmd:${cmd}`, ok: true });
    await send(ctx, reply, msg.message_id);
  } catch (e) {
    await logActivity({ platform: "telegram", chatId: ctx.chatId, userId: ctx.userId, action: `cmd:${parsed?.cmd ?? "text"}`, ok: false, note: core.errMsg(e) });
    await send(ctx, { text: `Error: ${core.errMsg(e)}` }, msg.message_id);
  }
  return undefined;
}

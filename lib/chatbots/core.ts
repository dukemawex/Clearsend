// Platform-neutral escrow bot logic used by the Telegram bot.
// Reuses lib/escrow, lib/escrow-links, lib/fx, lib/paypal, lib/documents and the shared verifier.
import { randomBytes } from "crypto";
import { attachEscrowDocument, createEscrow, fundEscrow, getEscrow, refundEscrow, releaseEscrow, submitDeliverable, verifyDeliverable, type EscrowRecord } from "@/lib/escrow";
import { createEscrowLink, verifyEscrowToken } from "@/lib/escrow-links";
import { getMidMarketRate } from "@/lib/fx";
import { captureOrder, createOrder, createPayout, refundCapture } from "@/lib/paypal";
import { extractDocument } from "@/lib/documents";
import { evaluateEscrow } from "@/lib/verifier";
import { del, getJSON, k, logActivity, setJSON, once } from "./store";
import { confirmPhrase, isEmail, isEscrowId, isInviteCode, parseInlineEscrow, parseQuote, parseRoleLink, phraseMatches, quoteBreakdown, roleAllowed, type Role } from "./parse";
import { recordActivity } from "@/lib/activity";
import { receiptMessages } from "./notify";

function botLog(ctx: Pick<Ctx, "platform" | "userName" | "isGroup">, subject: string | undefined, summary: string) {
  return recordActivity({ kind: "chat", subject: subject || `${ctx.platform}-chat`, actor: `${ctx.platform}:${ctx.userName}`, summary: `${summary} (${ctx.platform}${ctx.isGroup ? " group" : " DM"})` });
}

export type Platform = "telegram";
export type Ctx = { platform: Platform; chatId: string; userId: string; userName: string; isGroup: boolean };
export type Button = { label: string; id?: string; url?: string; style?: "primary" | "danger" | "success" | "secondary" };
export type Reply = { text: string; buttons?: Button[]; ephemeral?: boolean; forceReply?: boolean; dm?: { text: string; buttons?: Button[]; to?: string } };
export type IncomingDoc = { name: string; mime: string; bytes: ArrayBuffer };

const DAY = 86400;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") ? process.env.NEXT_PUBLIC_APP_URL : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong").slice(0, 300);
const userKey = (ctx: Ctx) => `${ctx.platform}:${ctx.userId}`;

// ---------- role + chat mappings (clearsend:chat:*) ----------
export async function getRole(escrowId: string, ctx: Pick<Ctx, "platform" | "userId">): Promise<Role | null> {
  return getJSON<Role>(k("role", escrowId, ctx.platform, ctx.userId));
}
export async function bindRole(escrowId: string, role: Role, ctx: Ctx): Promise<{ ok: boolean; reason?: string }> {
  const existing = await getRole(escrowId, ctx);
  if (existing && existing !== role) return { ok: false, reason: `You already hold the ${existing} role on this escrow; one person cannot hold two roles.` };
  const holder = await getJSON<string>(k("holder", escrowId, role));
  if (holder && holder !== userKey(ctx)) return { ok: false, reason: `The ${role} role is already taken by someone else.` };
  await setJSON(k("role", escrowId, ctx.platform, ctx.userId), role, 90 * DAY);
  await setJSON(k("holder", escrowId, role), userKey(ctx), 90 * DAY);
  await setJSON(k("name", escrowId, role), ctx.userName.slice(0, 64), 90 * DAY);
  return { ok: true };
}
async function linkChat(ctx: Ctx, escrowId: string) {
  await setJSON(k("current", ctx.platform, ctx.chatId), escrowId, 90 * DAY);
  await setJSON(k("escrowchat", escrowId, ctx.platform), ctx.chatId, 90 * DAY);
}
async function resolveEscrow(ctx: Ctx, idArg?: string): Promise<EscrowRecord | null> {
  const id = idArg && isEscrowId(idArg) ? idArg : await getJSON<string>(k("current", ctx.platform, ctx.chatId));
  return id ? getEscrow(id) : null;
}
const noEscrow: Reply = { text: "No escrow is linked to this chat yet. Start one with /escrow, or pass an escrow id.", ephemeral: true };

async function newInvite(escrowId: string, role: Role) {
  const code = randomBytes(12).toString("base64url"); // 16 chars, 96 bits, unguessable
  await setJSON(k("invite", code), { escrowId, role }, 7 * DAY);
  return code;
}
export function telegramInviteLinks(code: string) {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return bot ? { dm: `https://t.me/${bot}?start=${code}`, group: `https://t.me/${bot}?startgroup=${code}` } : null;
}

// ---------- help / quote ----------
export function help(platform: Platform): Reply {
  void platform; const p = "/";
  return { text: [
    "ClearSend escrow bot (PayPal sandbox). The money only moves after the payer approves in PayPal, the AI verifier checks the work, and the payer confirms with a button and typed words.",
    "",
    "/escrow <amount> <CUR> to <name> [email] for <spec>, or /escrow for guided steps",
    `${p}status [id]: where the escrow is`,
    `/join <code or role link>: take your role (payer, recipient, verifier)`,
    `${p}fund: payer pays into escrow with PayPal`,
    `${p}submit: recipient submits work (text or a file)`,
    `${p}verify: AI checks the work against the spec`,
    `${p}release: payer releases to the recipient (after verification)`,
    `${p}refund: return funds to the payer`,
    "/quote <amount> <from> <to>: live FX quote with fees",
  ].join("\n") };
}

export async function quote(args: string): Promise<Reply> {
  const q = parseQuote(args);
  if (!q) return { text: "Usage: /quote 100 USD NGN", ephemeral: true };
  const { rate, source } = await getMidMarketRate(q.from, q.to);
  const b = quoteBreakdown(q.amount, rate);
  return { text: [
    `Quote for ${money(q.amount, q.from)} to ${q.to} (live, ${source})`,
    `Fee (2.5%): ${money(b.fee, q.from)}`,
    `Mid-market rate: 1 ${q.from} = ${rate.toFixed(4)} ${q.to}`,
    `Your rate (incl. 1.2% FX spread): ${b.customerRate.toFixed(4)}`,
    `Recipient gets: ${b.receive.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${q.to}`,
  ].join("\n") };
}

// ---------- create (inline or guided) ----------
type Draft = { amount?: number; currency?: string; recipient?: string; recipientEmail?: string; recipientCountry?: string; specification?: string; payerEmail?: string };
const STEPS: Array<{ field: keyof Draft; ask: string }> = [
  { field: "amount", ask: "How much should go into escrow? Reply with amount and currency, e.g. 150 USD." },
  { field: "recipient", ask: "Who is being paid? Reply with their name." },
  { field: "recipientEmail", ask: "What is the recipient's PayPal email (sandbox)? Payouts are sent there on release." },
  { field: "recipientCountry", ask: "Which country is the recipient in? (e.g. NG, GH, KE, GB)" },
  { field: "specification", ask: "Describe what must be delivered (the spec the AI verifier will check against)." },
  { field: "payerEmail", ask: "Your PayPal email (sandbox), for the funding receipt. Tip: reply in a DM with the bot if you prefer not to share it in the group." },
];
const draftKey = (ctx: Ctx) => k("draft", ctx.platform, ctx.chatId, ctx.userId);
export async function hasDraft(ctx: Ctx) { return !!(await getJSON<Draft>(draftKey(ctx))); }

function nextStep(d: Draft) { return STEPS.find((s) => d[s.field] === undefined || (s.field === "amount" && !d.currency)); }

export async function startCreate(ctx: Ctx, args: string): Promise<Reply> {
  let d: Draft = {};
  if (args) {
    const p = parseInlineEscrow(args);
    if (!p) return { text: "I couldn't read that. Use: /escrow 150 USD to Ada <ada@example.com> for 3 logo concepts as PNG, or just /escrow for guided steps.", ephemeral: true };
    d = { amount: p.amount, currency: p.currency, recipient: p.recipient, recipientEmail: p.recipientEmail, specification: p.specification };
  }
  return continueDraft(ctx, d);
}

async function continueDraft(ctx: Ctx, d: Draft): Promise<Reply> {
  const step = nextStep(d);
  if (step) { await setJSON(draftKey(ctx), d, 1800); return { text: step.ask, forceReply: true }; }
  await del(draftKey(ctx));
  return finishCreate(ctx, d as Required<Draft>);
}

/** Free text answer while a draft is open. */
export async function answerDraft(ctx: Ctx, text: string): Promise<Reply> {
  const d = (await getJSON<Draft>(draftKey(ctx))) ?? {};
  const step = nextStep(d);
  if (!step) return continueDraft(ctx, d);
  const t = text.trim();
  if (/^(cancel|stop)$/i.test(t)) { await del(draftKey(ctx)); return { text: "Escrow setup cancelled." }; }
  switch (step.field) {
    case "amount": {
      const m = /^(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})$/.exec(t);
      const amt = m ? Number(m[1].replace(",", ".")) : NaN;
      if (!m || !(amt > 0) || amt > 100000) return { text: "Please reply like: 150 USD", forceReply: true };
      d.amount = amt; d.currency = m[2].toUpperCase(); break;
    }
    case "recipientEmail": case "payerEmail":
      if (!isEmail(t)) return { text: "That doesn't look like an email. Try again (or reply cancel).", forceReply: true };
      d[step.field] = t.toLowerCase(); break;
    case "recipientCountry":
      if (!/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(t)) return { text: "Please reply with a country name or 2-letter code.", forceReply: true };
      d.recipientCountry = t.length === 2 ? t.toUpperCase() : t; break;
    default:
      if (t.length < 2) return { text: "Please give a bit more detail.", forceReply: true };
      (d as Record<string, unknown>)[step.field] = t.slice(0, step.field === "specification" ? 2000 : 80);
  }
  return continueDraft(ctx, d);
}

export async function createFromFields(ctx: Ctx, d: Draft): Promise<Reply> { return continueDraft(ctx, d); }

async function finishCreate(ctx: Ctx, d: Required<Draft>): Promise<Reply> {
  const escrow = await createEscrow({ payer: ctx.userName.slice(0, 80), payerEmail: d.payerEmail, recipient: d.recipient, recipientEmail: d.recipientEmail, recipientCountry: d.recipientCountry, amount: d.amount, currency: d.currency, specification: d.specification });
  await bindRole(escrow.id, "payer", ctx);
  await linkChat(ctx, escrow.id);
  await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "create", escrowId: escrow.id, ok: true });
  const rCode = await newInvite(escrow.id, "recipient");
  const vCode = await newInvite(escrow.id, "verifier");
  const tg = ctx.platform === "telegram";
  const joinLine = (role: string, code: string) => {
    const links = tg ? telegramInviteLinks(code) : null;
    return `${role}: ${links ? links.dm : ""}${links ? "  or in this chat: " : ""}/join ${code}`;
  };
  return {
    text: [
      `Escrow ${escrow.id} created: ${money(escrow.amount, escrow.currency)} from ${escrow.payer} to ${escrow.recipient} (${escrow.recipientCountry}).`,
      `Spec: ${escrow.specification.slice(0, 300)}`,
      "",
      `${ctx.userName} is the payer. Invite the other parties (each code works once per role):`,
      joinLine("Recipient", rCode),
      joinLine("Verifier (optional)", vCode),
      "",
      "Next: payer runs fund to pay into escrow with PayPal (sandbox).",
    ].join("\n"),
    buttons: [{ label: "Fund with PayPal", id: `act:fund:${escrow.id}`, style: "primary" }, { label: "Status", id: `act:status:${escrow.id}` }],
    dm: { text: `Your private payer link for ${escrow.id} (don't share): ${createEscrowLink(escrow.id, "payer", appUrl())}` },
  };
}

// ---------- join ----------
export async function join(ctx: Ctx, arg: string): Promise<Reply> {
  await botLog(ctx, undefined, "joined an escrow with an invite code");
  let target: { escrowId: string; role: Role } | null = null;
  const link = parseRoleLink(arg);
  if (link) {
    if (!verifyEscrowToken(link.escrowId, link.role, link.token)) return { text: "That role link is not valid.", ephemeral: true };
    target = { escrowId: link.escrowId, role: link.role };
  } else if (isInviteCode(arg.trim())) {
    target = await getJSON<{ escrowId: string; role: Role }>(k("invite", arg.trim()));
    if (!target) return { text: "That invite code is unknown or expired. Ask the payer for a new one.", ephemeral: true };
  } else return { text: "Send /join <invite code> or paste your ClearSend role link.", ephemeral: true };
  const escrow = await getEscrow(target.escrowId);
  if (!escrow) return { text: "That escrow no longer exists.", ephemeral: true };
  const res = await bindRole(escrow.id, target.role, ctx);
  await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: `join:${target.role}`, escrowId: escrow.id, ok: res.ok, note: res.reason });
  if (!res.ok) return { text: res.reason!, ephemeral: true };
  await linkChat(ctx, escrow.id);
  return { text: `${ctx.userName} joined escrow ${escrow.id} as ${target.role}.`, buttons: [{ label: "Status", id: `act:status:${escrow.id}` }] };
}

// ---------- status ----------
const NEXT: Record<string, string> = {
  created: "Payer: fund it with PayPal.",
  funded: "Recipient: submit the work (text or a file).",
  submitted: "Anyone in the escrow: run verify so the AI checks the work.",
  verified: "Payer: release the payout (button + typed confirmation).",
  rejected: "Recipient can't resubmit on this escrow; payer or verifier can refund.",
  released: "Done. Funds were paid out via PayPal (sandbox).",
  refunded: "Done. Funds were refunded to the payer.",
};
export async function status(ctx: Ctx, idArg?: string): Promise<Reply> {
  const escrow = await resolveEscrow(ctx, idArg);
  if (!escrow) return noEscrow;
  const role = await getRole(escrow.id, ctx);
  const linked = await getJSON<string>(k("escrowchat", escrow.id, ctx.platform));
  if (!role && linked !== ctx.chatId) return { text: "You're not a party to that escrow.", ephemeral: true };
  const names = await Promise.all((["payer", "recipient", "verifier"] as Role[]).map(async (r) => `${r}: ${(await getJSON<string>(k("name", escrow.id, r))) ?? "(not joined)"}`));
  const ev = escrow.evaluationResult;
  return { text: [
    `Escrow ${escrow.id}: ${escrow.state.toUpperCase()}`,
    `${money(escrow.amount, escrow.currency)} to ${escrow.recipient} (${escrow.recipientCountry})`,
    `Spec: ${escrow.specification.slice(0, 300)}`,
    `Parties: ${names.join(", ")}`,
    escrow.deliverable ? `Deliverable: ${escrow.deliverable.slice(0, 200)}${(escrow.documents ?? []).filter((d) => d.role === "deliverable").length ? ` (+${(escrow.documents ?? []).filter((d) => d.role === "deliverable").length} file)` : ""}` : "",
    ev ? `AI verifier: ${ev.met ? "MET" : "NOT MET"}: ${ev.reasons.slice(0, 400)}` : "",
    `Next: ${NEXT[escrow.state]}`,
    role ? `Your role: ${role}` : "",
  ].filter(Boolean).join("\n") };
}

// ---------- confirmations ----------
type Pending = { action: "capture" | "release" | "refund"; escrowId: string; platform: Platform; userId: string; chatId: string; phrase?: string };
async function newConfirm(p: Pending) {
  const nonce = randomBytes(9).toString("base64url");
  await setJSON(k("confirm", nonce), p, 600);
  return nonce;
}
async function guard(ctx: Ctx, escrow: EscrowRecord, action: string): Promise<Reply | null> {
  const role = await getRole(escrow.id, ctx);
  if (!roleAllowed(action, role)) return { text: `Only the ${action === "submit" ? "recipient" : action === "refund" ? "payer or verifier" : action === "verify" ? "escrow parties" : "payer"} can ${action} this escrow${role ? ` (you are the ${role})` : " (you haven't joined it)"}.`, ephemeral: true };
  return null;
}

// ---------- fund ----------
export async function fund(ctx: Ctx, idArg?: string): Promise<Reply> {
  await botLog(ctx, idArg, "asked to fund the escrow with PayPal");
  const escrow = await resolveEscrow(ctx, idArg);
  if (!escrow) return noEscrow;
  const g = await guard(ctx, escrow, "fund"); if (g) return g;
  if (escrow.state !== "created") return { text: `Escrow is already ${escrow.state}.`, ephemeral: true };
  let order = await getJSON<{ orderId: string; approveUrl?: string }>(k("order", escrow.id));
  if (!order) {
    const o = await createOrder({ amount: escrow.amount, currency: escrow.currency, returnTo: { kind: "escrow", id: escrow.id }, description: `ClearSend Escrow ${escrow.id} - ${escrow.specification.slice(0, 100)}` });
    const approveUrl = (o.links as Array<{ rel: string; href: string }> | undefined)?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
    order = { orderId: o.id as string, approveUrl };
    await setJSON(k("order", escrow.id), order, 3 * DAY);
    await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "order_created", escrowId: escrow.id, ok: true });
  }
  const nonce = await newConfirm({ action: "capture", escrowId: escrow.id, platform: ctx.platform, userId: ctx.userId, chatId: ctx.chatId });
  const buttons: Button[] = [
    ...(order.approveUrl ? [{ label: "Approve in PayPal (sandbox)", url: order.approveUrl }] : []),
    { label: "I approved: capture into escrow", id: `c:${nonce}`, style: "success" },
  ];
  return {
    text: `Pay ${money(escrow.amount, escrow.currency)} into escrow ${escrow.id}.\n1) Open the PayPal approval link (sent to you privately) and approve with your sandbox buyer account.\n2) Press "I approved" to capture. Nothing is charged until you approve in PayPal.`,
    buttons: [{ label: "I approved: capture into escrow", id: `c:${nonce}`, style: "success" }],
    dm: { text: `PayPal sandbox approval for escrow ${escrow.id}: ${money(escrow.amount, escrow.currency)}. PayPal order ${order.orderId}.`, buttons },
  };
}

// ---------- submit ----------
export async function submit(ctx: Ctx, idArg: string | undefined, text: string, doc?: IncomingDoc): Promise<Reply> {
  await botLog(ctx, idArg, "submitted a deliverable in chat");
  const escrow = await resolveEscrow(ctx, idArg);
  if (!escrow) return noEscrow;
  const g = await guard(ctx, escrow, "submit"); if (g) return g;
  if (escrow.state !== "funded") return { text: `Escrow is ${escrow.state}; work can only be submitted once it's funded.`, ephemeral: true };
  let docNote = "";
  if (doc) {
    const file = new File([doc.bytes], doc.name, { type: doc.mime });
    const extracted = await extractDocument(file);
    await attachEscrowDocument(escrow.id, "deliverable", extracted);
    docNote = ` with file ${extracted.name} (${extracted.method}${extracted.note ? `: ${extracted.note}` : `, ${extracted.text.length} chars read`})`;
  }
  if (!text.trim() && !doc) return { text: "Add a description after the command, or reply to a document/photo with /submit.", ephemeral: true };
  const updated = await submitDeliverable(escrow.id, text);
  await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "submit", escrowId: escrow.id, ok: true });
  return { text: `${ctx.userName} submitted the deliverable${docNote}. Escrow is ${updated.state}. Next: run verify so the AI checks it against the spec.`, buttons: [{ label: "Run AI verification", id: `act:verify:${escrow.id}`, style: "primary" }] };
}

// ---------- verify (long; callers defer) ----------
export async function verify(ctx: Ctx, idArg?: string): Promise<Reply> {
  await botLog(ctx, idArg, "asked the AI verifier to check the deliverable");
  const escrow = await resolveEscrow(ctx, idArg);
  if (!escrow) return noEscrow;
  const g = await guard(ctx, escrow, "verify"); if (g) return g;
  if (escrow.state !== "submitted") return { text: `Escrow is ${escrow.state}, expected submitted.`, ephemeral: true };
  if (!(await once(k("verifying", escrow.id), 120))) return { text: "Verification is already running for this escrow.", ephemeral: true };
  try {
    const result = await evaluateEscrow(escrow);
    const updated = await verifyDeliverable(escrow.id, result);
    await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "verify", escrowId: escrow.id, ok: true, note: result.met ? "met" : "not met" });
    const crit = (result.criteriaResults ?? []).slice(0, 6).map((c) => `${c.met ? "✓" : "✗"} ${c.criterion}: ${c.reason}`).join("\n");
    return {
      text: `AI verifier: ${result.met ? "MEETS the spec" : "does NOT meet the spec"}.\n${result.reasons.slice(0, 900)}${crit ? `\n${crit}` : ""}\nEscrow is now ${updated.state}.`,
      buttons: result.met ? [{ label: "Release payout (payer)", id: `act:release:${escrow.id}`, style: "primary" }] : [{ label: "Refund payer", id: `act:refund:${escrow.id}`, style: "danger" }],
    };
  } finally { await del(k("verifying", escrow.id)); }
}

// ---------- release / refund: button + typed words ----------
export async function requestRelease(ctx: Ctx, idArg?: string): Promise<Reply> {
  await botLog(ctx, idArg, "requested release (button + typed amount required)");
  const escrow = await resolveEscrow(ctx, idArg);
  if (!escrow) return noEscrow;
  const g = await guard(ctx, escrow, "release"); if (g) return g;
  if (escrow.state !== "verified" || !escrow.evaluationResult?.met) return { text: `Release needs an AI-verified escrow; this one is ${escrow.state}.`, ephemeral: true };
  if (!escrow.recipientEmail && !escrow.recipientPayerId) return { text: "No recipient PayPal email on this escrow.", ephemeral: true };
  const phrase = confirmPhrase("release", escrow.amount, escrow.currency);
  const nonce = await newConfirm({ action: "release", escrowId: escrow.id, platform: ctx.platform, userId: ctx.userId, chatId: ctx.chatId, phrase });
  return { text: `Release ${money(escrow.amount, escrow.currency)} to ${escrow.recipient} via PayPal Payouts (sandbox)? Press confirm, then type exactly: ${phrase}`, buttons: [{ label: "Confirm release", id: `c:${nonce}`, style: "danger" }] };
}
export async function requestRefund(ctx: Ctx, idArg?: string): Promise<Reply> {
  await botLog(ctx, idArg, "requested a refund (button + typed amount required)");
  const escrow = await resolveEscrow(ctx, idArg);
  if (!escrow) return noEscrow;
  const g = await guard(ctx, escrow, "refund"); if (g) return g;
  if (!["funded", "submitted", "rejected"].includes(escrow.state) || !escrow.captureId) return { text: `Escrow is ${escrow.state}; nothing to refund.`, ephemeral: true };
  const phrase = confirmPhrase("refund", escrow.amount, escrow.currency);
  const nonce = await newConfirm({ action: "refund", escrowId: escrow.id, platform: ctx.platform, userId: ctx.userId, chatId: ctx.chatId, phrase });
  return { text: `Refund ${money(escrow.amount, escrow.currency)} to the payer's PayPal (sandbox)? Press confirm, then type exactly: ${phrase}`, buttons: [{ label: "Confirm refund", id: `c:${nonce}`, style: "danger" }] };
}

/** Button press on a c:<nonce> confirmation. Returns either a phrase prompt or the executed result. */
export async function pressConfirm(ctx: Ctx, nonce: string): Promise<Reply & { needPhrase?: { nonce: string; phrase: string } }> {
  const p = await getJSON<Pending>(k("confirm", nonce));
  if (!p) return { text: "This confirmation expired. Run the command again.", ephemeral: true };
  if (p.platform !== ctx.platform || p.userId !== ctx.userId) return { text: "Only the person who asked can confirm this.", ephemeral: true };
  if (p.phrase) {
    await setJSON(k("await", ctx.platform, ctx.chatId, ctx.userId), nonce, 300);
    return { text: `Type exactly: ${p.phrase}`, forceReply: true, needPhrase: { nonce, phrase: p.phrase } };
  }
  return execute(ctx, nonce, p);
}

export async function awaitingPhrase(ctx: Ctx): Promise<string | null> {
  return getJSON<string>(k("await", ctx.platform, ctx.chatId, ctx.userId));
}

/** Typed confirmation words (Telegram reply text). */
export async function submitPhrase(ctx: Ctx, nonce: string, typed: string): Promise<Reply> {
  const p = await getJSON<Pending>(k("confirm", nonce));
  await del(k("await", ctx.platform, ctx.chatId, ctx.userId));
  if (!p) return { text: "This confirmation expired. Run the command again.", ephemeral: true };
  if (p.platform !== ctx.platform || p.userId !== ctx.userId) return { text: "Only the person who asked can confirm this.", ephemeral: true };
  if (!p.phrase || !phraseMatches(typed, p.phrase)) {
    await del(k("confirm", nonce));
    await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: `${p.action}_phrase_mismatch`, escrowId: p.escrowId, ok: false });
    return { text: `The words didn't match, so nothing moved. Run ${p.action} again to retry.` };
  }
  return execute(ctx, nonce, p);
}

async function execute(ctx: Ctx, nonce: string, p: Pending): Promise<Reply> {
  await recordActivity({ kind: "confirmation", subject: p.escrowId, actor: `${ctx.platform}:${ctx.userName}`, summary: `Confirmed ${p.action} in ${ctx.platform}${p.phrase ? " by typing the exact phrase" : " with a button"}.` });
  if (!(await once(k("done", nonce), DAY))) return { text: "Already handled.", ephemeral: true };
  await del(k("confirm", nonce));
  const escrow = await getEscrow(p.escrowId);
  if (!escrow) return noEscrow;
  const g = await guard(ctx, escrow, p.action); if (g) return g; // role re-checked at execution time
  try {
    if (p.action === "capture") {
      const order = await getJSON<{ orderId: string }>(k("order", escrow.id));
      if (!order) return { text: "No PayPal order found; run fund again." };
      if (escrow.state !== "created") return { text: `Escrow is already ${escrow.state}.` };
      const cap = await captureOrder(order.orderId);
      const captureId = cap.purchase_units?.[0]?.payments?.captures?.[0]?.id as string | undefined;
      if (!captureId) throw new Error("PayPal returned no capture id");
      const funded = await fundEscrow(escrow.id, order.orderId, captureId, cap.purchase_units?.[0]?.payments?.captures?.[0]?.status ?? cap.status);
      await del(k("order", escrow.id));
      await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "fund", escrowId: escrow.id, ok: true });
      return withReceipt(funded, "funding", `Funded. ${money(escrow.amount, escrow.currency)} captured into escrow (PayPal sandbox capture ${captureId}). Recipient: submit your work.`);
    }
    if (p.action === "release") {
      if (escrow.state !== "verified" || !escrow.evaluationResult?.met) return { text: `Escrow is ${escrow.state}; release needs AI verification.` };
      const payout = await createPayout({ recipientEmail: escrow.recipientEmail || escrow.recipientPayerId!, amount: escrow.amount, currency: escrow.currency, note: `ClearSend Escrow Release: ${escrow.specification.slice(0, 100)}` });
      const batchId = payout.batch_header?.payout_batch_id as string | undefined;
      if (!batchId) throw new Error("PayPal returned no payout batch id");
      const released = await releaseEscrow(escrow.id, batchId, payout.items?.[0]?.payout_item_id, payout.batch_header?.batch_status);
      await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "release", escrowId: escrow.id, ok: true });
      return withReceipt(released, "payout", `Released. ${money(escrow.amount, escrow.currency)} sent to ${escrow.recipient} via PayPal Payouts (sandbox batch ${batchId}).`);
    }
    if (!escrow.captureId || !["funded", "submitted", "rejected"].includes(escrow.state)) return { text: `Escrow is ${escrow.state}; nothing to refund.` };
    const r = await refundCapture(escrow.captureId, { value: escrow.amount.toFixed(2), currency: escrow.currency }, "ClearSend escrow refund (chat)");
    const refunded = await refundEscrow(escrow.id, r.id as string, r.status as string | undefined);
    await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: "refund", escrowId: escrow.id, ok: true });
    return withReceipt(refunded, "refund", `Refunded ${money(escrow.amount, escrow.currency)} to the payer (PayPal sandbox refund ${r.id}).`);
  } catch (e) {
    await logActivity({ platform: ctx.platform, chatId: ctx.chatId, userId: ctx.userId, action: p.action, escrowId: escrow.id, ok: false, note: errMsg(e) });
    return { text: `${p.action} failed: ${errMsg(e)}` };
  }
}

/** Group gets the token-free receipt summary; the payer gets a DM with their private receipt link. */
async function withReceipt(e: EscrowRecord, kind: "funding" | "payout" | "refund", head: string): Promise<Reply> {
  const m = await receiptMessages(e, kind);
  if (!m) return { text: head };
  return { text: `${head}\n\n${m.group}`, dm: m.payerChatUserId ? { text: m.dm, to: m.payerChatUserId } : undefined };
}

/** act:<action>:<escrowId> buttons (non-money shortcuts that re-run the command for the presser). */
export async function pressAction(ctx: Ctx, action: string, escrowId: string): Promise<Reply> {
  switch (action) {
    case "status": return status(ctx, escrowId);
    case "fund": return fund(ctx, escrowId);
    case "verify": return verify(ctx, escrowId);
    case "release": return requestRelease(ctx, escrowId);
    case "refund": return requestRefund(ctx, escrowId);
    default: return { text: "Unknown action.", ephemeral: true };
  }
}

export { errMsg };

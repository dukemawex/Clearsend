// Telegram receipt notifications. Group messages never carry role tokens; only the payer's DM does.
import type { EscrowRecord } from "@/lib/escrow";
import { signEscrowToken } from "@/lib/escrow-links";
import { receiptId, receiptText, type ReceiptKind } from "@/lib/receipts";
import { getJSON, k } from "./store";

export function appBase() {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  if (u && !u.includes("localhost")) return u;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return u ?? "http://localhost:3000";
}

export function receiptUrl(id: string, subjectId: string, withToken: boolean) {
  const base = `${appBase()}/receipt/${id}`;
  return withToken ? `${base}?role=payer&token=${signEscrowToken(subjectId, "payer")}` : base;
}

/** Builds group + DM texts for the stored receipt of this kind. Returns null if no receipt was stored. */
export async function receiptMessages(e: EscrowRecord, kind: ReceiptKind) {
  const r = (e.receipts ?? []).find((x) => x.id === receiptId(kind, e.id));
  if (!r) return null;
  const text = receiptText(r);
  const holder = await getJSON<string>(k("holder", e.id, "payer")).catch(() => null);
  const payerChatUserId = holder?.startsWith("telegram:") ? holder.slice("telegram:".length) : undefined;
  return {
    receipt: r,
    group: `${text}\nParties can open the full receipt from their private ClearSend link: ${receiptUrl(r.id, e.id, false)}`,
    dm: `${text}\nYour private receipt (printable / PDF): ${receiptUrl(r.id, e.id, true)}\nDon't share this link; it carries your payer access token.`,
    payerChatUserId,
  };
}

/** Called from web routes after a real capture/payout/refund. Never throws. */
export async function notifyReceipt(e: EscrowRecord, kind: ReceiptKind) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    const m = await receiptMessages(e, kind);
    if (!m) return;
    const chatId = await getJSON<string>(k("escrowchat", e.id, "telegram"));
    const { tg } = await import("./telegram");
    if (chatId) await tg("sendMessage", { chat_id: chatId, text: m.group.slice(0, 4000), disable_web_page_preview: true });
    if (m.payerChatUserId && m.payerChatUserId !== chatId) await tg("sendMessage", { chat_id: Number(m.payerChatUserId), text: m.dm.slice(0, 4000), disable_web_page_preview: true });
  } catch (err) {
    console.warn("receipt_notify_failed", { error: err instanceof Error ? err.message : "unknown" });
  }
}

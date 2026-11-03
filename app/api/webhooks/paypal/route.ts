import { lookupPayoutError } from "@/lib/payout-sync";
import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { processPayPalEvent, type WebhookDeps } from "@/lib/paypal-webhook";
import { findEscrowByPayPal, fundEscrow, reconcilePayoutStatus, refundEscrow } from "@/lib/escrow";
import { findTripByPayPal } from "@/lib/trips";
import { recordActivity } from "@/lib/activity";
import { del, getJSON, k, once } from "@/lib/chatbots/store";
import { tg } from "@/lib/chatbots/telegram";
import { notifyReceipt } from "@/lib/chatbots/notify";

export const dynamic = "force-dynamic";
const DEDUPE_TTL = 30 * 24 * 3600;

const deps: WebhookDeps = {
  once: (id) => once(k("ppwh", id), DEDUPE_TTL),
  forget: (id) => del(k("ppwh", id)),
  findEscrow: findEscrowByPayPal,
  findTrip: findTripByPayPal,
  fundEscrow: async (id, o, c, s) => { const e = await fundEscrow(id, o, c, s); await notifyReceipt(e, "funding").catch(() => undefined); return e; },
  refundEscrow: async (id, r, s) => { const e = await refundEscrow(id, r, s); await notifyReceipt(e, "refund").catch(() => undefined); return e; },
  reconcilePayout: reconcilePayoutStatus,
  lookupPayoutError: (batchId, itemId) => lookupPayoutError(batchId, itemId),
  activity: async (a) => { await recordActivity({ kind: "paypal", actor: "PayPal webhook", ...a }); },
  notifyTelegram: async (escrowId, text) => {
    const chat = await getJSON<string>(k("escrowchat", escrowId, "telegram"));
    if (chat && process.env.TELEGRAM_BOT_TOKEN) await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true });
  },
};

export async function POST(request: Request) {
  const raw = await request.text();
  const v = await verifyWebhookSignature(request.headers, raw);
  if (!v.ok) {
    console.warn("paypal_webhook_rejected", { reason: v.reason });
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 401 });
  }
  const event = JSON.parse(raw);
  try {
    const result = await processPayPalEvent(event, deps);
    console.info("paypal_webhook_processed", { eventType: event.event_type, eventId: event.id, ...result });
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("paypal_webhook_error", { eventType: event.event_type, eventId: event.id, error: (e as Error).message });
    return NextResponse.json({ error: "Processing failed; PayPal will retry" }, { status: 500 });
  }
}

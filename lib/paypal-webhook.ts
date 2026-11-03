/* eslint-disable @typescript-eslint/no-explicit-any -- PayPal webhook resources are loosely typed JSON; fields are read defensively. */
// PayPal webhook reconciliation. Called only AFTER the signature was verified with PayPal.
// Rules: dedupe on event id; only confirm/reconcile what PayPal already did; never move an escrow backwards;
// never create money movement (no captures, payouts or refunds are started from here; release stays human-gated).
import type { EscrowRecord } from "./escrow";
import type { TripRecord } from "./trips";

export const HANDLED_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTSBATCH.DENIED",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.BLOCKED", "PAYMENT.PAYOUTS-ITEM.RETURNED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "PAYMENT.PAYOUTS-ITEM.HELD", "PAYMENT.PAYOUTS-ITEM.REFUNDED", "PAYMENT.PAYOUTS-ITEM.CANCELED",
] as const;

/** Payout outcomes worth telling the Telegram group about. */
export const PAYOUT_PROBLEMS = new Set(["FAILED", "BLOCKED", "RETURNED", "UNCLAIMED", "HELD", "REFUNDED", "CANCELED", "DENIED"]);

export type PayPalEvent = { id?: string; event_type?: string; resource_type?: string; resource?: Record<string, any> };

export type WebhookDeps = {
  once(eventId: string): Promise<boolean>;
  forget(eventId: string): Promise<void>;
  findEscrow(q: { id?: string; orderId?: string; captureId?: string; payoutBatchId?: string }): Promise<EscrowRecord | null>;
  findTrip(q: { id?: string; orderId?: string; captureId?: string }): Promise<TripRecord | null>;
  fundEscrow(id: string, orderId: string, captureId: string, status: string): Promise<EscrowRecord>;
  refundEscrow(id: string, refundId: string, status: string): Promise<EscrowRecord>;
  reconcilePayout(id: string, status: string, itemId?: string): Promise<EscrowRecord>;
  activity(a: { ownerId?: string; subject: string; summary: string; data?: Record<string, unknown> }): Promise<void>;
  notifyTelegram(escrowId: string, text: string): Promise<void>;
};

export type WebhookResult = { status: "duplicate" | "ignored" | "unmatched" | "reconciled" | "logged"; subject?: string; note?: string };

function parseCustomId(v: unknown): { kind?: string; id?: string } {
  if (typeof v !== "string") return {};
  const [kind, ...rest] = v.split(":");
  return rest.length ? { kind, id: rest.join(":") } : {};
}
function linkId(r: Record<string, any>, rel: string, segment: string): string | undefined {
  const href = (r.links as Array<{ rel: string; href: string }> | undefined)?.find((l) => l.rel === rel && l.href.includes(`/${segment}/`))?.href;
  return href?.split(`/${segment}/`)[1]?.split(/[/?]/)[0];
}

export async function processPayPalEvent(ev: PayPalEvent, d: WebhookDeps): Promise<WebhookResult> {
  const type = ev.event_type ?? "";
  if (!ev.id || !(HANDLED_EVENTS as readonly string[]).includes(type)) return { status: "ignored", note: type || "no event type" };
  if (!(await d.once(ev.id))) return { status: "duplicate" };
  try {
    return await route(type, ev.resource ?? {}, ev.id, d);
  } catch (e) {
    await d.forget(ev.id); // let PayPal's retry try again
    throw e;
  }
}

async function route(type: string, r: Record<string, any>, eventId: string, d: WebhookDeps): Promise<WebhookResult> {
  const data = { eventId, eventType: type, source: "paypal-webhook" };

  if (type === "CHECKOUT.ORDER.APPROVED" || type.startsWith("PAYMENT.CAPTURE.")) {
    const isOrder = type === "CHECKOUT.ORDER.APPROVED";
    const isRefund = type === "PAYMENT.CAPTURE.REFUNDED";
    const custom = parseCustomId(isOrder ? r.purchase_units?.[0]?.custom_id : r.custom_id);
    const orderId: string | undefined = isOrder ? r.id : r.supplementary_data?.related_ids?.order_id;
    const captureId: string | undefined = isRefund ? linkId(r, "up", "captures") : isOrder ? undefined : r.id;
    const escrow = custom.kind === "trip" ? null : await d.findEscrow({ id: custom.kind === "escrow" ? custom.id : undefined, orderId, captureId });
    if (escrow) return escrowPayment(type, r, escrow, orderId, captureId, d, data);
    const trip = custom.kind === "escrow" ? null : await d.findTrip({ id: custom.kind === "trip" ? custom.id : undefined, orderId, captureId });
    if (trip) {
      // Trips are reconciled in the activity feed only; capture + ticketing stay in the booking flow.
      const amt = r.amount ? ` ${r.amount.value} ${r.amount.currency_code}` : "";
      await d.activity({ ownerId: trip.ownerId, subject: trip.id, summary: `PayPal webhook: ${type}${amt} for trip ${trip.origin} → ${trip.destination} (order ${orderId ?? "?"}).`, data });
      return { status: "logged", subject: trip.id };
    }
    return { status: "unmatched", note: `order ${orderId ?? "?"} capture ${captureId ?? "?"}` };
  }

  // Payouts
  const isBatch = type.startsWith("PAYMENT.PAYOUTSBATCH.");
  const batchId: string | undefined = isBatch ? r.batch_header?.payout_batch_id : r.payout_batch_id;
  const senderItemId: string | undefined = isBatch ? undefined : r.payout_item?.sender_item_id;
  const itemId: string | undefined = isBatch ? undefined : r.payout_item_id;
  const status: string = (isBatch ? r.batch_header?.batch_status : r.transaction_status) ?? type.split(".").pop()!;
  const escrow = await d.findEscrow({ id: senderItemId?.startsWith("escrow_") ? senderItemId : undefined, payoutBatchId: batchId });
  if (!escrow) return { status: "unmatched", note: `payout batch ${batchId ?? "?"}` };
  if (escrow.state !== "released") {
    await d.activity({ ownerId: escrow.ownerId, subject: escrow.id, summary: `PayPal webhook: ${type} received but escrow is ${escrow.state}, not released. Not applied; please check.`, data });
    return { status: "logged", subject: escrow.id, note: "escrow not released" };
  }
  await d.reconcilePayout(escrow.id, status, itemId);
  await d.activity({ ownerId: escrow.ownerId, subject: escrow.id, summary: `PayPal confirms payout ${isBatch ? "batch" : "item"} status ${status} for ${escrow.recipient} (batch ${batchId ?? "?"}).`, data: { ...data, payoutStatus: status } });
  const short = type.split(".").pop()!;
  if (PAYOUT_PROBLEMS.has(short) || PAYOUT_PROBLEMS.has(status)) {
    await d.notifyTelegram(escrow.id, `⚠️ PayPal reports the payout for escrow ${escrow.id} is ${status}. The payout of ${escrow.amount} ${escrow.currency} escrow to ${escrow.recipient} has not been confirmed as received. The payer should check PayPal (sandbox).`).catch(() => undefined);
  }
  return { status: "reconciled", subject: escrow.id, note: status };
}

async function escrowPayment(type: string, r: Record<string, any>, e: EscrowRecord, orderId: string | undefined, captureId: string | undefined, d: WebhookDeps, data: Record<string, unknown>): Promise<WebhookResult> {
  if (type === "PAYMENT.CAPTURE.COMPLETED" && e.state === "created" && orderId && captureId) {
    // PayPal already captured the payer's money: confirm funding (forward-only).
    await d.fundEscrow(e.id, orderId, captureId, r.status ?? "COMPLETED");
    return { status: "reconciled", subject: e.id, note: "funded" };
  }
  if (type === "PAYMENT.CAPTURE.REFUNDED" && ["funded", "submitted", "rejected"].includes(e.state) && e.captureId && !e.refundId && r.id) {
    await d.refundEscrow(e.id, r.id, r.status ?? "COMPLETED");
    return { status: "reconciled", subject: e.id, note: "refunded" };
  }
  const amt = r.amount ? ` ${r.amount.value} ${r.amount.currency_code}` : "";
  const extra = type === "PAYMENT.CAPTURE.REFUNDED" && !["funded", "submitted", "rejected", "refunded"].includes(e.state) ? ` Escrow is ${e.state}; state not changed, please check.` : "";
  await d.activity({ ownerId: e.ownerId, subject: e.id, summary: `PayPal webhook: ${type}${amt} (order ${orderId ?? e.orderId ?? "?"}, status ${r.status ?? "?"}).${extra}`, data });
  return { status: "logged", subject: e.id };
}

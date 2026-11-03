import { test } from "node:test";
import assert from "node:assert/strict";
// TEST FIXTURES only: memory store, synthetic escrows, stubbed PayPal deps. No real PayPal calls.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.ESCROW_LINK_SECRET ||= "test-secret-for-payout-reason";
globalThis.fetch = (async () => { throw new Error("network disabled in tests"); }) as typeof fetch;

import { claimSettlement, createEscrow, fundEscrow, getEscrow, releaseEscrow, submitDeliverable, verifyDeliverable, reconcilePayoutStatus } from "../lib/escrow";
import { lookupPayoutError, refreshPayout } from "../lib/payout-sync";
import { processPayPalEvent, type WebhookDeps } from "../lib/paypal-webhook";
import { buildReceipt, normalizeEscrowPayoutReceipt, receiptText } from "../lib/receipts";

async function released(batch: string) {
  const e = await createEscrow({ payer: "TEST", payerEmail: "t@example.com", recipient: "R", recipientEmail: "r@example.com", recipientCountry: "US", amount: 5, currency: "USD", specification: "test", ownerId: null });
  await fundEscrow(e.id, "ORD-" + e.id, "CAP-" + e.id);
  await submitDeliverable(e.id, "done");
  await verifyDeliverable(e.id, { met: true, reasons: "ok", evaluatedAt: 1 });
  assert.equal((await claimSettlement(e.id, "release")).ok, true);
  return releaseEscrow(e.id, batch, "I-" + batch, "PENDING");
}
// Batch GET without item errors (as PayPal often returns); the item GET carries them.
const batchNoErrors = (b: string) => ({ batch_header: { payout_batch_id: b, batch_status: "DENIED" }, items: [{ payout_item_id: "I-" + b, transaction_status: "FAILED" }] });
const itemWithError = (id: string) => ({ payout_item_id: id, transaction_status: "FAILED", errors: { name: "RECEIVER_COUNTRY_NOT_ALLOWED", message: "x" } });

test("lookupPayoutError falls back to the payout item GET", async () => {
  const r = await lookupPayoutError("B1", undefined, { fetchBatch: (async (b: string) => batchNoErrors(b)) as never, fetchItem: (async (id: string) => itemWithError(id)) as never });
  assert.deepEqual(r, { code: "RECEIVER_COUNTRY_NOT_ALLOWED", message: "x", itemId: "I-B1" });
  const none = await lookupPayoutError("B1", undefined, { fetchBatch: (async () => { throw new Error("down"); }) as never, fetchItem: (async () => { throw new Error("down"); }) as never });
  assert.equal(none.code, undefined);
});

test("webhook DENIED batch without errors records code + reason immediately", async () => {
  const e = await released("BATCH-W");
  const deps: WebhookDeps = {
    once: async () => true, forget: async () => undefined, findEscrow: async () => (await getEscrow(e.id))!, findTrip: async () => null,
    fundEscrow: async () => { throw new Error("no"); }, refundEscrow: async () => { throw new Error("no"); },
    reconcilePayout: reconcilePayoutStatus, activity: async () => undefined, notifyTelegram: async () => undefined,
    lookupPayoutError: (b, i) => lookupPayoutError(b, i, { fetchBatch: (async (x: string) => batchNoErrors(x)) as never, fetchItem: (async (x: string) => itemWithError(x)) as never }),
  };
  await processPayPalEvent({ id: "WH-1", event_type: "PAYMENT.PAYOUTSBATCH.DENIED", resource: { batch_header: { payout_batch_id: "BATCH-W", batch_status: "DENIED" } } }, deps);
  const after = (await getEscrow(e.id))!;
  assert.equal(after.payoutFailure?.code, "RECEIVER_COUNTRY_NOT_ALLOWED");
  assert.match(after.payoutFailure!.reason, /country/);
  const rec = after.receipts!.find((r) => r.kind === "payout")!;
  assert.equal(rec.status, "FAILED (RECEIVER_COUNTRY_NOT_ALLOWED)");
  assert.match(rec.failureReason!, /country/);
});

test("status poll fills in a missing code on an already-failed payout", async () => {
  const e = await released("BATCH-Q");
  await reconcilePayoutStatus(e.id, "FAILED", undefined, undefined, "BATCH-Q");
  const out = await refreshPayout((await getEscrow(e.id))!, (async (b: string) => batchNoErrors(b)) as never, (async (id: string) => itemWithError(id)) as never);
  assert.equal(out.payoutFailure?.code, "RECEIVER_COUNTRY_NOT_ALLOWED");
});

test("failed payout receipt is restated with current fee model (no stale 4.81)", () => {
  const stale = { ...buildReceipt({ kind: "payout", subjectType: "escrow", subjectId: "escrow_1_fix", issuedAt: 0, payer: "P", recipient: "R", amount: 5, currency: "USD", fx: { destinationCurrency: "USD", midMarketRate: 1, source: "t" }, paypal: {}, status: "PENDING" }) };
  stale.fx = { ...stale.fx!, spreadPercent: 1.2, customerRate: 0.988, destinationAmount: 4.81 }; delete stale.settledAmount;
  const n = normalizeEscrowPayoutReceipt(stale, { status: "FAILED (RECEIVER_COUNTRY_NOT_ALLOWED)", failureReason: "PayPal can't send payouts to the recipient's PayPal account country." });
  assert.equal(n.settledAmount, 4.87); assert.equal(n.fee, 0.13);
  assert.equal(n.fx?.spreadPercent, 0); assert.equal(n.fx?.customerRate, 1); assert.equal(n.fx?.destinationAmount, 4.87);
  const t = receiptText(n);
  assert.match(t, /Sent to recipient: 4\.87 USD/); assert.match(t, /Reason: PayPal can't send/); assert.doesNotMatch(t, /4\.81/);
});

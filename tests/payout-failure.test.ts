import { test } from "node:test";
import assert from "node:assert/strict";
// TEST FIXTURES only: memory store, synthetic escrows, stubbed PayPal deps. No real PayPal calls.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.ESCROW_LINK_SECRET ||= "test-secret-for-payout-tests";
globalThis.fetch = (async () => { throw new Error("network disabled in tests"); }) as typeof fetch;

import { explainPayoutError, isPayoutFailed, payoutOutcome } from "../lib/payout-failure";
import { claimSettlement, createEscrow, fundEscrow, getEscrow, reconcilePayoutStatus, releaseEscrow, submitDeliverable, verifyDeliverable } from "../lib/escrow";
import { retryPayout, type RetryDeps } from "../lib/payout-retry";
import { refreshPayout } from "../lib/payout-sync";
import { PayPalError } from "../lib/paypal";
import { processPayPalEvent, type WebhookDeps } from "../lib/paypal-webhook";

const denied = (batch: string) => ({ batch_header: { payout_batch_id: batch, batch_status: "DENIED" }, items: [{ payout_item_id: "I-" + batch, transaction_status: "FAILED", errors: { name: "RECEIVER_COUNTRY_NOT_ALLOWED", message: "x" } }] });
const pending = (batch: string) => ({ batch_header: { payout_batch_id: batch, batch_status: "PENDING" }, items: [{ payout_item_id: "I-" + batch, transaction_status: "PENDING" }] });

async function releasedEscrow(batch = "BATCH-A") {
  const e = await createEscrow({ payer: "TEST", payerEmail: "t@example.com", recipient: "R", recipientEmail: "r@example.com", recipientCountry: "US", amount: 5, currency: "USD", specification: "test", ownerId: null });
  await fundEscrow(e.id, "ORD-" + e.id, "CAP-" + e.id);
  await submitDeliverable(e.id, "done");
  await verifyDeliverable(e.id, { met: true, reasons: "ok", evaluatedAt: 1 });
  assert.equal((await claimSettlement(e.id, "release")).ok, true);
  return releaseEscrow(e.id, batch, "I-" + batch, "PENDING");
}

test("payoutOutcome reads a DENIED batch with a FAILED item and PayPal's error code", () => {
  assert.deepEqual(payoutOutcome(denied("B")), { status: "FAILED", code: "RECEIVER_COUNTRY_NOT_ALLOWED", message: "x" });
  assert.equal(payoutOutcome(pending("B")).status, "PENDING");
  assert.equal(payoutOutcome({ batch_header: { batch_status: "DENIED" } }).status, "DENIED");
  assert.match(explainPayoutError("RECEIVER_COUNTRY_NOT_ALLOWED"), /country/);
  assert.ok(isPayoutFailed("RETURNED") && isPayoutFailed("BLOCKED") && !isPayoutFailed("UNCLAIMED") && !isPayoutFailed("HELD"));
});

test("failed status records FAILED + reason, updates the receipt, and never un-fails", async () => {
  const e = await releasedEscrow();
  const f = await reconcilePayoutStatus(e.id, "FAILED", undefined, "RECEIVER_COUNTRY_NOT_ALLOWED", "BATCH-A");
  assert.equal(f.state, "released");
  assert.equal(f.payoutStatus, "FAILED");
  assert.equal(f.payoutFailure?.code, "RECEIVER_COUNTRY_NOT_ALLOWED");
  assert.match(f.payoutFailure!.reason, /country/);
  assert.match(f.receipts!.find((r) => r.kind === "payout")!.status, /^FAILED/);
  const later = await reconcilePayoutStatus(e.id, "SUCCESS", undefined, undefined, "BATCH-A");
  assert.equal(later.payoutStatus, "FAILED");
  const stale = await reconcilePayoutStatus(e.id, "SUCCESS", undefined, undefined, "OTHER-BATCH");
  assert.equal(stale.payoutStatus, "FAILED");
});

test("status poll (escrow page / receipt) records a denied payout", async () => {
  const e = await releasedEscrow("BATCH-P");
  const out = await refreshPayout(e, (async () => denied("BATCH-P")) as never);
  assert.equal(out.payoutFailure?.status, "FAILED");
  assert.equal(out.payoutFailure?.code, "RECEIVER_COUNTRY_NOT_ALLOWED");
});

test("retry refuses unless PayPal's API confirms the current batch failed", async () => {
  const e = await releasedEscrow("BATCH-R0");
  let paid = 0;
  const deps: RetryDeps = { fetchStatus: (async () => pending("BATCH-R0")) as never, pay: (async () => { paid++; return {}; }) as never };
  await assert.rejects(retryPayout(e.id, {}, deps), (err: Error & { code?: string }) => err.code === "PAYOUT_NOT_FAILED");
  // stored failure alone is not enough: PayPal still says PENDING
  await reconcilePayoutStatus(e.id, "FAILED", undefined, "RECEIVER_COUNTRY_NOT_ALLOWED");
  await assert.rejects(retryPayout(e.id, {}, deps), (err: Error & { code?: string }) => err.code === "PAYOUT_NOT_FAILED");
  assert.equal(paid, 0);
});

test("retry with a corrected recipient pays once, keeps refund impossible, and can't repeat for the same batch", async () => {
  const e = await releasedEscrow("BATCH-R1");
  let paid = 0;
  const deps: RetryDeps = { fetchStatus: (async (b: string) => (b === "BATCH-R1" ? denied(b) : pending(b))) as never, pay: (async (p: { receiver?: string }) => { paid++; assert.equal(p.receiver, "fixed@example.com"); return { batch_header: { payout_batch_id: "BATCH-R2", batch_status: "PENDING" }, items: [{ payout_item_id: "I-R2" }] }; }) as never };
  await assert.rejects(retryPayout(e.id, { recipientCountry: "ZZ" }, deps), (err: Error & { code?: string }) => err.code === "PAYOUT_UNSUPPORTED");
  const r = await retryPayout(e.id, { recipientType: "EMAIL", recipientEmail: "fixed@example.com", recipientCountry: "US" }, deps);
  assert.equal(paid, 1);
  assert.equal(r.payoutBatchId, "BATCH-R2");
  assert.equal(r.payoutFailure, undefined);
  assert.equal(r.payoutAttempts?.[0].batchId, "BATCH-R1");
  assert.equal(r.payoutAttempts?.[0].code, "RECEIVER_COUNTRY_NOT_ALLOWED");
  assert.equal(r.receipts!.filter((x) => x.kind === "payout").length, 1);
  assert.equal((await claimSettlement(e.id, "refund")).ok, false);
  // new batch is PENDING at PayPal: no further retry
  await assert.rejects(retryPayout(e.id, {}, deps), (err: Error & { code?: string }) => err.code === "PAYOUT_NOT_FAILED");
  assert.equal(paid, 1);
});

test("one retry per failed batch even if called twice; a PayPal 4xx frees it again", async () => {
  const e = await releasedEscrow("BATCH-D1");
  let paid = 0, fail4xx = true;
  const deps: RetryDeps = { fetchStatus: (async () => denied("BATCH-D1")) as never, pay: (async () => { paid++; if (fail4xx) { fail4xx = false; throw new PayPalError("bad receiver", 422); } return { batch_header: { payout_batch_id: "BATCH-D2", batch_status: "PENDING" }, items: [] }; }) as never };
  await assert.rejects(retryPayout(e.id, {}, deps), PayPalError);
  await retryPayout(e.id, {}, deps);
  assert.equal(paid, 2);
  assert.equal((await getEscrow(e.id))!.payoutBatchId, "BATCH-D2");
  // the new batch D2 also fails at PayPal: one more retry allowed, and a second call for D2 is refused.
  const deps2: RetryDeps = { fetchStatus: (async (b: string) => (b === "BATCH-D3" ? pending(b) : denied(b))) as never, pay: (async () => ({ batch_header: { payout_batch_id: "BATCH-D3" }, items: [] })) as never };
  await retryPayout(e.id, {}, deps2);
  assert.equal((await getEscrow(e.id))!.payoutAttempts?.length, 2);
  await assert.rejects(retryPayout(e.id, {}, deps2), (err: Error & { code?: string }) => err.code === "PAYOUT_NOT_FAILED");
});

test("concurrent retries: only one pays", async () => {
  const e = await releasedEscrow("BATCH-C1");
  let paid = 0;
  const deps: RetryDeps = { fetchStatus: (async (b: string) => (b === "BATCH-C1" ? denied(b) : pending(b))) as never, pay: (async () => { paid++; await new Promise((r) => setTimeout(r, 20)); return { batch_header: { payout_batch_id: "BATCH-C2" }, items: [] }; }) as never };
  const rs = await Promise.allSettled([retryPayout(e.id, {}, deps), retryPayout(e.id, {}, deps)]);
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(paid, 1);
});

test("webhook PAYOUTS-ITEM.FAILED passes the error code, tells Telegram, ignores stale batches", async () => {
  const calls: string[] = [];
  const esc = { id: "escrow_1_x", state: "released", payoutBatchId: "B2", recipient: "R", amount: 5, currency: "USD" } as never;
  const d = { once: async () => true, forget: async () => {}, findEscrow: async () => esc, findTrip: async () => null, fundEscrow: async () => esc, refundEscrow: async () => esc,
    reconcilePayout: async (_id: string, s: string, _i?: string, c?: string) => { calls.push(`payout:${s}:${c}`); return esc; },
    activity: async () => {}, notifyTelegram: async (_id: string, t: string) => { calls.push(`tg:${t}`); } } as unknown as WebhookDeps;
  const ev = (id: string, batch: string) => ({ id, event_type: "PAYMENT.PAYOUTS-ITEM.FAILED", resource: { payout_batch_id: batch, payout_item_id: "I", transaction_status: "FAILED", payout_item: { sender_item_id: "escrow_1_x" }, errors: { name: "RECEIVER_COUNTRY_NOT_ALLOWED" } } });
  assert.equal((await processPayPalEvent(ev("E1", "B2"), d)).status, "reconciled");
  assert.ok(calls.includes("payout:FAILED:RECEIVER_COUNTRY_NOT_ALLOWED"));
  assert.ok(calls.some((c) => c.startsWith("tg:❌ Payout failed") && c.includes("country")));
  assert.equal((await processPayPalEvent(ev("E2", "B1"), d)).note, "stale batch");
});

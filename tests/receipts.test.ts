import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, parseReceiptId, receiptId, receiptText, formatLagos, formatUtc, SANDBOX_LABEL } from "../lib/receipts";

// TEST FIXTURE ONLY: synthetic ids, never shown in the app and not a real PayPal event.
const FIXTURE = {
  kind: "funding" as const, subjectType: "escrow" as const, subjectId: "escrow_1700000000000_testfix01",
  issuedAt: Date.UTC(2026, 10, 3, 4, 30, 0),
  payer: "TEST payer", payerEmail: "test-payer@example.com", recipient: "TEST recipient", recipientCountry: "KE",
  amount: 100, currency: "USD", fx: { destinationCurrency: "NGN", midMarketRate: 1500, source: "test-fixture" },
  paypal: { orderId: "TEST-ORDER", captureId: "TEST-CAPTURE", payoutBatchId: undefined },
  status: "COMPLETED",
};

test("receipt builder: fee, FX spread, ids, sandbox label (test fixture)", () => {
  const r = buildReceipt(FIXTURE);
  assert.equal(r.id, "rcpt_funding_escrow_1700000000000_testfix01");
  assert.equal(r.fee, 2.5);
  assert.equal(r.feePercent, 2.5);
  assert.equal(r.fx?.spreadPercent, 1.2);
  assert.equal(r.fx?.customerRate, 1500 * 0.988);
  assert.equal(r.fx?.destinationAmount, Math.round(97.5 * 1482 * 100) / 100);
  assert.equal(r.environment, SANDBOX_LABEL);
  assert.equal(r.number, "CS-20261103-FUN-TFIX01");
  assert.deepEqual(r.paypal, { orderId: "TEST-ORDER", captureId: "TEST-CAPTURE" });
});

test("receipt builder: no FX, fee override (trip)", () => {
  const r = buildReceipt({ ...FIXTURE, kind: "refund", subjectType: "trip", subjectId: "trip_1_testfix", fx: null, feeOverride: { percent: 3, amount: 4.2 }, paypal: { refundId: "TEST-REFUND" } });
  assert.equal(r.fx, undefined);
  assert.equal(r.fee, 4.2);
  assert.equal(r.feePercent, 3);
});

test("receipt id round trip and rejects junk", () => {
  assert.deepEqual(parseReceiptId(receiptId("payout", "escrow_1_abc")), { kind: "payout", subjectType: "escrow", subjectId: "escrow_1_abc" });
  assert.equal(parseReceiptId("rcpt_funding_../x"), null);
  assert.equal(parseReceiptId("nope"), null);
});

test("chat receipt text has both time zones and no token", () => {
  const t = receiptText(buildReceipt(FIXTURE));
  assert.match(t, /2026-11-03 04:30:00 UTC/);
  assert.match(t, /05:30:00 WAT \(Lagos\)/);
  assert.match(t, /PayPal Sandbox - test payment, no real money/);
  assert.doesNotMatch(t, /token=/);
  assert.ok(formatUtc(0).endsWith("UTC") && formatLagos(0).includes("Lagos"));
});

test("receipt access: 401 without token, 403 wrong token, 404 when no receipt stored", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.VERCEL_ENV;
  process.env.ESCROW_LINK_SECRET = "test-secret-for-unit-tests";
  const { loadReceipt } = await import("../lib/receipt-access");
  const { createEscrow } = await import("../lib/escrow");
  const { signEscrowToken } = await import("../lib/escrow-links");
  const e = await createEscrow({ payer: "TEST", payerEmail: "t@example.com", recipient: "R", recipientCountry: "KE", amount: 5, currency: "USD", specification: "test" });
  const id = receiptId("funding", e.id);
  assert.equal((await loadReceipt(id, {})).status, 401);
  assert.equal((await loadReceipt(id, { role: "payer", token: "bad" })).status, 403);
  assert.equal((await loadReceipt(id, { role: "payer", token: signEscrowToken(e.id, "payer") })).status, 404);
});

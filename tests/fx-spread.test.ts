import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, spreadPercentFor } from "../lib/receipts";
import { quoteBreakdown } from "../lib/chatbots/parse";

// TEST FIXTURE ONLY: synthetic values, not a real PayPal event.
const base = {
  kind: "payout" as const, subjectType: "escrow" as const, subjectId: "escrow_1700000000000_testfix02",
  issuedAt: Date.UTC(2026, 10, 3, 4, 30, 0), payer: "TEST payer", recipient: "TEST recipient",
  amount: 5, currency: "USD", paypal: { payoutBatchId: "TEST-BATCH" }, status: "PENDING",
};

test("same-currency payout has no spread and rate 1", () => {
  const r = buildReceipt({ ...base, fx: { destinationCurrency: "USD", midMarketRate: 1, source: "test-fixture" } });
  assert.equal(r.fx?.spreadPercent, 0);
  assert.equal(r.fx?.customerRate, 1);
  assert.equal(r.fx?.destinationAmount, 4.87);
});

test("same-currency ignores a non-1 stored mid rate", () => {
  const r = buildReceipt({ ...base, fx: { destinationCurrency: "usd", midMarketRate: 0.999, source: "test-fixture" } });
  assert.equal(r.fx?.customerRate, 1);
});

test("cross-currency still applies 1.2% spread", () => {
  const r = buildReceipt({ ...base, fx: { destinationCurrency: "NGN", midMarketRate: 1500, source: "test-fixture" } });
  assert.equal(r.fx?.spreadPercent, 1.2);
  assert.ok(Math.abs((r.fx?.customerRate ?? 0) - 1482) < 1e-9);
});

test("spreadPercentFor and quoteBreakdown", () => {
  assert.equal(spreadPercentFor("USD", "usd"), 0);
  assert.equal(spreadPercentFor("USD", "EUR"), 1.2);
  const same = quoteBreakdown(5, 1, "USD", "USD");
  assert.equal(same.customerRate, 1); assert.equal(same.receive, 4.88); assert.equal(same.spreadPercent, 0);
  const cross = quoteBreakdown(100, 2, "USD", "EUR");
  assert.equal(cross.spreadPercent, 1.2); assert.equal(cross.receive, 192.66);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutRequestBody, refundRequestBody, refundRequestId } from "../lib/paypal";
import { buildReceipt, escrowFee, escrowPayoutAmount, receiptText } from "../lib/receipts";
import { checkOrderMatchesEscrow } from "../lib/order-check";

// TEST FIXTURES ONLY: synthetic values, never real PayPal data.
test("refund body uses Payments v2 shape amount {value, currency_code}", () => {
  assert.deepEqual(refundRequestBody({ value: 5, currency: "usd" }, "ClearSend Escrow refund"), { amount: { value: "5.00", currency_code: "USD" }, note_to_payer: "ClearSend Escrow refund" });
  const b = refundRequestBody({ value: "5.00", currency: "USD" }) as { amount: Record<string, string> };
  assert.deepEqual(Object.keys(b.amount).sort(), ["currency_code", "value"]);
  assert.ok(!("currency" in b.amount), "refund must never send amount.currency");
  assert.deepEqual(refundRequestBody(), {});
});

test("refund PayPal-Request-Id is stable per escrow (idempotent retries)", () => {
  assert.equal(refundRequestId("CAP1", "escrow_1_abc"), refundRequestId("CAP1", "escrow_1_abc"));
  assert.match(refundRequestId("CAP1", "escrow_1_abc"), /^cs-refund-[A-Za-z0-9_-]+$/);
});

test("payout body uses Payouts v1 shape amount {value, currency}", () => {
  const b = payoutRequestBody({ recipientEmail: "r@example.com", amount: 4.875, currency: "usd", senderItemId: "escrow_x" }, "batch-1");
  assert.deepEqual(b.items[0].amount, { value: "4.88", currency: "USD" });
  assert.equal(b.items[0].sender_item_id, "escrow_x");
  assert.equal(b.items[0].recipient_type, "EMAIL");
  assert.ok(!("currency_code" in b.items[0].amount));
});

test("capture order check compares amount to what the payer is charged (escrow amount)", () => {
  const order = { intent: "CAPTURE", status: "APPROVED", purchase_units: [{ custom_id: "escrow:e1", amount: { value: "5.00", currency_code: "USD" } }] };
  assert.equal(checkOrderMatchesEscrow(order, { id: "e1", amount: 5, currency: "USD" }), null);
});

test("fee model: payer charged amount, recipient paid amount - 2.5%, refund returns all", () => {
  assert.equal(escrowFee(5), 0.13);
  assert.equal(escrowPayoutAmount(5), 4.87);
  assert.equal(escrowPayoutAmount(100), 97.5);
  const base = { subjectType: "escrow" as const, subjectId: "escrow_1_testfix", issuedAt: 0, payer: "P", recipient: "R", amount: 5, currency: "USD", fx: { destinationCurrency: "USD", midMarketRate: 1, source: "test" }, paypal: {}, status: "X" };
  const fund = buildReceipt({ ...base, kind: "funding" });
  assert.equal(fund.settledAmount, 5);
  const pay = buildReceipt({ ...base, kind: "payout" });
  assert.equal(pay.settledAmount, 4.87); assert.equal(pay.fee, 0.13); assert.equal(pay.fx?.destinationAmount, 4.87);
  assert.match(receiptText(pay), /Sent to recipient: 4\.87 USD/);
  const ref = buildReceipt({ ...base, kind: "refund", fx: null });
  assert.equal(ref.settledAmount, 5); assert.equal(ref.fee, 0);
  assert.match(receiptText(ref), /Refunded to payer: 5\.00 USD/);
});

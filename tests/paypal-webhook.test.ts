import { test } from "node:test";
import assert from "node:assert/strict";
import { processPayPalEvent, type WebhookDeps } from "../lib/paypal-webhook";
import { verifyWebhookSignature, WEBHOOK_HEADERS } from "../lib/paypal";
import type { EscrowRecord } from "../lib/escrow";

// TEST FIXTURES ONLY: synthetic records and events, never stored or shown in the app.
function fixtureEscrow(over: Partial<EscrowRecord> = {}): EscrowRecord {
  return { id: "escrow_1700000000000_testwh01", ownerId: "TEST-owner", state: "created", payer: "TEST payer", payerEmail: "test-payer@example.com", recipient: "TEST recipient", recipientEmail: "test-recipient@example.com", recipientCountry: "KE", amount: 50, currency: "USD", specification: "TEST spec", createdAt: 1, timeline: [], ...over } as EscrowRecord;
}

function fakeDeps(escrow: EscrowRecord | null) {
  const seen = new Set<string>();
  const calls: string[] = [];
  let current = escrow;
  const d: WebhookDeps = {
    once: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    forget: async (id) => { seen.delete(id); },
    findEscrow: async (q) => (current && (q.id === current.id || (q.orderId && q.orderId === current.orderId) || (q.captureId && q.captureId === current.captureId) || (q.payoutBatchId && q.payoutBatchId === current.payoutBatchId)) ? current : null),
    findTrip: async () => null,
    fundEscrow: async (id, o, c) => { calls.push(`fund:${o}:${c}`); current = { ...current!, state: "funded", orderId: o, captureId: c }; return current; },
    refundEscrow: async (id, r) => { calls.push(`refund:${r}`); current = { ...current!, state: "refunded", refundId: r }; return current; },
    reconcilePayout: async (id, s) => { calls.push(`payout:${s}`); current = { ...current!, payoutStatus: s }; return current; },
    activity: async (a) => { calls.push(`activity:${a.summary.slice(0, 40)}`); },
    notifyTelegram: async (_id, text) => { calls.push(`tg:${text.slice(0, 10)}`); },
  };
  return { d, calls, get: () => current };
}

const capture = (id = "WH-TEST-1") => ({ id, event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "TEST-CAPTURE", status: "COMPLETED", custom_id: "escrow:escrow_1700000000000_testwh01", amount: { value: "50.00", currency_code: "USD" }, supplementary_data: { related_ids: { order_id: "TEST-ORDER" } } } });

test("capture completed funds a created escrow once (dedupe on event id)", async () => {
  const f = fakeDeps(fixtureEscrow());
  assert.equal((await processPayPalEvent(capture(), f.d)).status, "reconciled");
  assert.equal(f.get()!.state, "funded");
  assert.equal((await processPayPalEvent(capture(), f.d)).status, "duplicate");
  assert.equal(f.calls.filter((c) => c.startsWith("fund")).length, 1);
});

test("capture completed never moves a released escrow backwards", async () => {
  const f = fakeDeps(fixtureEscrow({ state: "released", orderId: "TEST-ORDER", captureId: "TEST-CAPTURE" }));
  assert.equal((await processPayPalEvent(capture("WH-TEST-2"), f.d)).status, "logged");
  assert.equal(f.get()!.state, "released");
  assert.ok(!f.calls.some((c) => c.startsWith("fund")));
});

test("refund webhook reconciles funded escrow via capture link; not for verified", async () => {
  const ev = (id: string) => ({ id, event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "TEST-REFUND", status: "COMPLETED", links: [{ rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/TEST-CAPTURE" }] } });
  const a = fakeDeps(fixtureEscrow({ state: "funded", captureId: "TEST-CAPTURE" }));
  assert.equal((await processPayPalEvent(ev("WH-TEST-3"), a.d)).note, "refunded");
  const b = fakeDeps(fixtureEscrow({ state: "verified", captureId: "TEST-CAPTURE" }));
  assert.equal((await processPayPalEvent(ev("WH-TEST-4"), b.d)).status, "logged");
  assert.equal(b.get()!.state, "verified");
});

test("payout item failure updates payout status and notifies Telegram, never changes state", async () => {
  const f = fakeDeps(fixtureEscrow({ state: "released", payoutBatchId: "TEST-BATCH" }));
  const r = await processPayPalEvent({ id: "WH-TEST-5", event_type: "PAYMENT.PAYOUTS-ITEM.RETURNED", resource: { payout_batch_id: "TEST-BATCH", payout_item_id: "TEST-ITEM", transaction_status: "RETURNED", payout_item: { sender_item_id: "escrow_1700000000000_testwh01" } } }, f.d);
  assert.equal(r.status, "reconciled");
  assert.equal(f.get()!.payoutStatus, "RETURNED");
  assert.equal(f.get()!.state, "released");
  assert.ok(f.calls.some((c) => c.startsWith("tg:")));
});

test("payout event for unreleased escrow is only logged", async () => {
  const f = fakeDeps(fixtureEscrow({ state: "verified", payoutBatchId: "TEST-BATCH" }));
  const r = await processPayPalEvent({ id: "WH-TEST-6", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { batch_header: { payout_batch_id: "TEST-BATCH", batch_status: "SUCCESS" } } }, f.d);
  assert.equal(r.status, "logged");
  assert.ok(!f.calls.some((c) => c.startsWith("payout")));
});

test("unknown events ignored; processing errors release the dedupe key", async () => {
  const f = fakeDeps(fixtureEscrow());
  assert.equal((await processPayPalEvent({ id: "WH-TEST-7", event_type: "BILLING.SUBSCRIPTION.CREATED" }, f.d)).status, "ignored");
  f.d.fundEscrow = async () => { throw new Error("TEST failure"); };
  await assert.rejects(processPayPalEvent(capture("WH-TEST-8"), f.d));
  f.d.fundEscrow = async () => fixtureEscrow({ state: "funded" });
  assert.equal((await processPayPalEvent(capture("WH-TEST-8"), f.d)).status, "reconciled");
});

// verify-webhook-signature: network stubbed in this test only.
const hdrs = () => new Headers(Object.fromEntries(WEBHOOK_HEADERS.map((h) => [h, `TEST-${h}`])));
function stubFetch(status: string) {
  const bodies: string[] = [];
  const f = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "TEST-TOKEN" }));
    bodies.push(String(init.body));
    return new Response(JSON.stringify({ verification_status: status }));
  }) as unknown as typeof fetch;
  return { f, bodies };
}

test("signature verification: fails closed without webhook id or headers, passes on SUCCESS", async () => {
  const saved = { id: process.env.PAYPAL_WEBHOOK_ID, c: process.env.PAYPAL_CLIENT_ID, s: process.env.PAYPAL_CLIENT_SECRET };
  try {
    process.env.PAYPAL_CLIENT_ID = "TEST-CLIENT"; process.env.PAYPAL_CLIENT_SECRET = "TEST-SECRET";
    delete process.env.PAYPAL_WEBHOOK_ID;
    assert.equal((await verifyWebhookSignature(hdrs(), "{}", stubFetch("SUCCESS").f)).ok, false);
    process.env.PAYPAL_WEBHOOK_ID = "TEST-WEBHOOK-ID";
    assert.equal((await verifyWebhookSignature(new Headers(), "{}", stubFetch("SUCCESS").f)).ok, false);
    assert.equal((await verifyWebhookSignature(hdrs(), "{}", stubFetch("FAILURE").f)).ok, false);
    const ok = stubFetch("SUCCESS");
    assert.equal((await verifyWebhookSignature(hdrs(), JSON.stringify({ id: "WH-TEST" }), ok.f)).ok, true);
    const sent = JSON.parse(ok.bodies[0]);
    assert.equal(sent.webhook_id, "TEST-WEBHOOK-ID");
    assert.equal(sent.webhook_event.id, "WH-TEST");
  } finally {
    for (const [k, v] of [["PAYPAL_WEBHOOK_ID", saved.id], ["PAYPAL_CLIENT_ID", saved.c], ["PAYPAL_CLIENT_SECRET", saved.s]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

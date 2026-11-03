import { test } from "node:test";
import assert from "node:assert/strict";
// TEST FIXTURES only: memory store, synthetic escrows, a stubbed PayPal (global fetch). No real PayPal calls.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.ESCROW_LINK_SECRET ||= "test-secret-for-authz-tests";
process.env.PAYPAL_CLIENT_ID = "test-id"; process.env.PAYPAL_CLIENT_SECRET = "test-secret"; process.env.PAYPAL_ENV = "sandbox";

const OWNER = "c".repeat(32), OTHER = "d".repeat(32);
const base = { payer: "TEST", payerEmail: "t@example.com", recipient: "R", recipientEmail: "r@example.com", recipientCountry: "KE", amount: 5, currency: "USD", specification: "test" };
const post = (url: string, body: unknown, owner?: string) => new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...(owner ? { cookie: `cs_uid=${owner}` } : {}) }, body: JSON.stringify(body) }) as never;

type Call = { url: string; method: string };
let calls: Call[] = [];
const orders: Record<string, unknown> = {};
const realFetch = globalThis.fetch;
function stubPayPal() {
  calls = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/v1/oauth2/token")) return json({ access_token: "stub", expires_in: 3600 });
    const m = /\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/.exec(url);
    if (m && !m[2]) return orders[m[1]] ? json(orders[m[1]]) : json({ name: "RESOURCE_NOT_FOUND" }, 404);
    if (m && m[2]) return json({ id: m[1], status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${m[1]}`, status: "COMPLETED" }] } }] });
    if (url.includes("/v1/payments/payouts")) { await new Promise((r) => setTimeout(r, 30)); return json({ batch_header: { payout_batch_id: "BATCH1", batch_status: "PENDING" }, items: [{ payout_item_id: "ITEM1" }] }, 201); }
    if (url.includes("/refund")) { await new Promise((r) => setTimeout(r, 30)); return json({ id: "REF1", status: "COMPLETED" }, 201); }
    return realFetch(input, init);
  }) as typeof fetch;
}
const order = (escrowId: string, value = "5.00", currency = "USD") => ({ id: "x", intent: "CAPTURE", status: "APPROVED", purchase_units: [{ custom_id: `escrow:${escrowId}`, amount: { value, currency_code: currency } }] });

async function setup() {
  const { createEscrow } = await import("../lib/escrow");
  const { runAsOwner } = await import("../lib/owner");
  const { signEscrowToken } = await import("../lib/escrow-links");
  const e = await runAsOwner(OWNER, () => createEscrow(base));
  const t = (r: "payer" | "recipient" | "verifier") => ({ role: r, token: signEscrowToken(e.id, r) });
  return { e, t };
}

test("checkOrderMatchesEscrow rejects other escrows, wrong amount/currency, unapproved", async () => {
  const { checkOrderMatchesEscrow } = await import("../lib/order-check");
  const e = { id: "esc_1", amount: 5, currency: "USD" };
  assert.equal(checkOrderMatchesEscrow(order("esc_1"), e), null);
  assert.match(String(checkOrderMatchesEscrow(order("esc_2"), e)), /not created for this escrow/);
  assert.match(String(checkOrderMatchesEscrow({ purchase_units: [{ amount: { value: "5.00", currency_code: "USD" } }] }, e)), /not created/);
  assert.match(String(checkOrderMatchesEscrow(order("esc_1", "4.00"), e)), /amount/);
  assert.match(String(checkOrderMatchesEscrow(order("esc_1", "5.00", "EUR"), e)), /currency/);
  assert.match(String(checkOrderMatchesEscrow({ ...order("esc_1"), status: "CREATED" }, e)), /not approved/);
});

test("fund: 401 no token, 403 wrong role, wrong order rejected, reused order rejected, correct order funds once", async () => {
  stubPayPal();
  const fund = (await import("../app/api/escrow/fund/route")).POST;
  const { e, t } = await setup();
  const { e: e2 } = await setup();
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id }))).status, 401);
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id }, OTHER))).status, 401, "another browser is not the creator");
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id, ...t("recipient") }))).status, 403);
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id, role: "payer", token: "0".repeat(64) }))).status, 403);
  assert.equal(calls.length, 0, "no PayPal call before auth");

  orders["ORD-OTHER"] = order(e2.id);
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id, orderId: "ORD-OTHER", ...t("payer") }))).status, 422);
  assert.ok(!calls.some((c) => c.url.endsWith("/capture")), "mismatched order never captured");
  orders["ORD-CHEAP"] = order(e.id, "0.01");
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id, orderId: "ORD-CHEAP", ...t("payer") }))).status, 422);

  orders["ORD-OK"] = order(e.id);
  const ok = await fund(post("/api/escrow/fund", { escrowId: e.id, orderId: "ORD-OK", ...t("payer") }));
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { state: string }).state, "funded");
  const { bindOrderToEscrow } = await import("../lib/escrow");
  assert.equal(await bindOrderToEscrow("ORD-OK", e2.id), false, "an order binds to one escrow only");
  const n = calls.filter((c) => c.url.endsWith("/capture")).length;
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e.id, orderId: "ORD-OK", ...t("payer") }))).status, 409);
  assert.equal(calls.filter((c) => c.url.endsWith("/capture")).length, n, "no second capture");
  orders["ORD-2"] = order(e2.id);
  assert.equal((await fund(post("/api/escrow/fund", { escrowId: e2.id, orderId: "ORD-2" }, OWNER))).status, 200, "creator cookie counts as payer");
});

test("submit needs recipient, verify needs verifier", async () => {
  const submit = (await import("../app/api/escrow/submit/route")).POST;
  const verify = (await import("../app/api/escrow/verify/route")).POST;
  const { e, t } = await setup();
  assert.equal((await submit(post("/api/escrow/submit", { escrowId: e.id, deliverable: "x" }))).status, 401);
  assert.equal((await submit(post("/api/escrow/submit", { escrowId: e.id, deliverable: "x", ...t("payer") }))).status, 403);
  assert.equal((await submit(post("/api/escrow/submit", { escrowId: e.id, deliverable: "x", ...t("verifier") }))).status, 403);
  assert.equal((await verify(post("/api/escrow/verify", { escrowId: e.id }))).status, 401);
  assert.equal((await verify(post("/api/escrow/verify", { escrowId: e.id, ...t("recipient") }))).status, 403);
  assert.equal((await verify(post("/api/escrow/verify", { escrowId: e.id, ...t("payer") }))).status, 403);
});

async function verifiedEscrow() {
  const { e, t } = await setup();
  const { fundEscrow, submitDeliverable, verifyDeliverable } = await import("../lib/escrow");
  await fundEscrow(e.id, `ORD-${e.id}`, `CAP-${e.id}`, "COMPLETED");
  await submitDeliverable(e.id, "done");
  await verifyDeliverable(e.id, { met: true, reasons: "test fixture", evaluatedAt: Date.now() });
  return { e, t };
}

test("release: payer only, server-side confirmation, single payout under concurrency, then no refund", async () => {
  stubPayPal();
  const release = (await import("../app/api/escrow/release/route")).POST;
  const refund = (await import("../app/api/escrow/refund/route")).POST;
  const { e, t } = await verifiedEscrow();
  const phrase = "RELEASE 5.00 USD";
  assert.equal((await release(post("/api/escrow/release", { escrowId: e.id, confirmation: phrase }))).status, 401);
  assert.equal((await release(post("/api/escrow/release", { escrowId: e.id, confirmation: phrase, ...t("recipient") }))).status, 403);
  assert.equal((await release(post("/api/escrow/release", { escrowId: e.id, confirmation: phrase, ...t("verifier") }))).status, 403);
  assert.equal((await release(post("/api/escrow/release", { escrowId: e.id, ...t("payer") }))).status, 400, "missing confirmation");
  assert.equal((await release(post("/api/escrow/release", { escrowId: e.id, confirmation: "RELEASE 50.00 USD", ...t("payer") }))).status, 400);
  assert.equal(calls.length, 0);
  const rs = await Promise.all([1, 2, 3].map(() => release(post("/api/escrow/release", { escrowId: e.id, confirmation: phrase, ...t("payer") }))));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal(calls.filter((c) => c.url.includes("/v1/payments/payouts")).length, 1, "exactly one payout");
  assert.equal((await refund(post("/api/escrow/refund", { escrowId: e.id, confirmation: "REFUND 5.00 USD", ...t("payer") }))).status, 409);
  assert.equal(calls.filter((c) => c.url.includes("/refund")).length, 0);
});

test("refund: payer or verifier with confirmation; recipient refused; one refund under concurrency; then no release", async () => {
  stubPayPal();
  const refund = (await import("../app/api/escrow/refund/route")).POST;
  const { e, t } = await setup();
  const { fundEscrow, claimSettlement } = await import("../lib/escrow");
  await fundEscrow(e.id, `ORD-${e.id}`, `CAP-${e.id}`, "COMPLETED");
  const phrase = "REFUND 5.00 USD";
  assert.equal((await refund(post("/api/escrow/refund", { escrowId: e.id, confirmation: phrase }))).status, 401);
  assert.equal((await refund(post("/api/escrow/refund", { escrowId: e.id, confirmation: phrase, ...t("recipient") }))).status, 403);
  assert.equal((await refund(post("/api/escrow/refund", { escrowId: e.id, ...t("verifier") }))).status, 400);
  const rs = await Promise.all([t("payer"), t("verifier")].map((c) => refund(post("/api/escrow/refund", { escrowId: e.id, confirmation: phrase, ...c }))));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  assert.equal(calls.filter((c) => c.url.includes("/refund")).length, 1);
  assert.deepEqual(await claimSettlement(e.id, "release"), { ok: false, by: "refund" });
});

test("GET escrow: creator cookie may open it without token; others get 401", async () => {
  const get = (await import("../app/api/escrow/[id]/route")).GET;
  const { e } = await setup();
  const g = (owner?: string) => get(new Request(`http://localhost/api/escrow/${e.id}`, { headers: owner ? { cookie: `cs_uid=${owner}` } : {} }) as never, { params: Promise.resolve({ id: e.id }) });
  assert.equal((await g()).status, 401);
  assert.equal((await g(OTHER)).status, 401);
  assert.equal((await g(OWNER)).status, 200);
});

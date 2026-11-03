import { test } from "node:test";
import assert from "node:assert/strict";
// Memory store only (no Upstash env in tests). TEST FIXTURES: synthetic owners and escrows.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.ESCROW_LINK_SECRET ||= "test-secret-for-privacy-tests";

const A = "a".repeat(32), B = "b".repeat(32);
const req = (url: string, owner?: string) => new Request(`http://localhost${url}`, { headers: owner ? { cookie: `cs_uid=${owner}` } : {} });

test("visitor A cannot list or fetch visitor B's escrows; role link shares one escrow", async () => {
  const { createEscrow, listEscrows } = await import("../lib/escrow");
  const { runAsOwner } = await import("../lib/owner");
  const { signEscrowToken } = await import("../lib/escrow-links");
  const list = (await import("../app/api/escrow/list/route")).GET;
  const one = (await import("../app/api/escrow/[id]/route")).GET;
  const base = { payer: "TEST", payerEmail: "t@example.com", recipient: "R", recipientEmail: "r@example.com", recipientCountry: "KE", amount: 5, currency: "USD", specification: "test" };
  const eA = await runAsOwner(A, () => createEscrow(base));
  const eB = await runAsOwner(B, () => createEscrow(base));
  const legacy = await createEscrow({ ...base, ownerId: null });
  assert.equal(eA.ownerId, A);
  assert.equal(legacy.ownerId, undefined);

  const la = (await (await list(req("/api/escrow/list", A))).json()) as { id: string }[];
  assert.ok(la.some((e) => e.id === eA.id));
  assert.ok(!la.some((e) => e.id === eB.id), "A must not see B");
  assert.ok(!la.some((e) => e.id === legacy.id), "legacy hidden");
  assert.deepEqual(await (await list(req("/api/escrow/list"))).json(), [], "no cookie → nothing");
  assert.equal((await listEscrows(null)).length, 0);

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  // Different cookie, no token → 401; wrong token → 403; unknown id with valid-looking token → 404.
  assert.equal((await one(req(`/api/escrow/${eB.id}`, A) as never, params(eB.id))).status, 401);
  assert.equal((await one(req(`/api/escrow/${eB.id}?role=payer&token=${signEscrowToken(eA.id, "payer")}`, A) as never, params(eB.id))).status, 403);
  const ghost = "escrow_0_nothere";
  assert.equal((await one(req(`/api/escrow/${ghost}?role=payer&token=${signEscrowToken(ghost, "payer")}`, A) as never, params(ghost))).status, 404);

  // A opens B's verifier link → that one escrow appears in A's "shared with me".
  const ok = await one(req(`/api/escrow/${eB.id}?role=verifier&token=${signEscrowToken(eB.id, "verifier")}`, A) as never, params(eB.id));
  assert.equal(ok.status, 200);
  const la2 = (await (await list(req("/api/escrow/list", A))).json()) as { id: string; sharedRole?: string }[];
  assert.equal(la2.find((e) => e.id === eB.id)?.sharedRole, "verifier");
  const lb = (await (await list(req("/api/escrow/list", B))).json()) as { id: string }[];
  assert.ok(!lb.some((e) => e.id === eA.id), "B still can't see A");
});

test("trips are private to their owner; other cookie or none gets 404", async () => {
  const { createTrip, listTrips } = await import("../lib/trips");
  const { runAsOwner } = await import("../lib/owner");
  const get = (await import("../app/api/trips/[id]/route")).GET;
  const t = await runAsOwner(A, () => createTrip({ origin: "LOS", destination: "NBO", departureDate: "2026-12-01", airline: "TEST", stops: 0, departureTime: "08:00", arrivalTime: "14:00", basePrice: 100, currency: "USD", provider: "duffel" }));
  assert.ok((await listTrips(A)).some((x) => x.id === t.id));
  assert.ok(!(await listTrips(B)).some((x) => x.id === t.id));
  const params = { params: Promise.resolve({ id: t.id }) };
  assert.equal((await get(req(`/api/trips/${t.id}`, A), params)).status, 200);
  assert.equal((await get(req(`/api/trips/${t.id}`, B), params)).status, 404);
  assert.equal((await get(req(`/api/trips/${t.id}`), params)).status, 404);
});

test("agent getEscrow/listEscrows tools are scoped to the owner", async () => {
  const { agentTools } = await import("../lib/agent");
  const { createEscrow } = await import("../lib/escrow");
  const { runAsOwner } = await import("../lib/owner");
  const e = await runAsOwner(B, () => createEscrow({ payer: "TEST", payerEmail: "t@example.com", recipient: "R", recipientEmail: "r@example.com", recipientCountry: "KE", amount: 5, currency: "USD", specification: "agent test" }));
  const exec = (n: "getEscrow" | "listEscrows", a: unknown) => (agentTools[n].execute as (i: unknown, o: unknown) => Promise<unknown>)(a, {});
  const got = (await runAsOwner(A, () => exec("getEscrow", { id: e.id }))) as { error?: string };
  assert.ok(got.error, "A's agent can't fetch B's escrow");
  const listed = (await runAsOwner("mcp:service", () => exec("listEscrows", {}))) as { id: string }[];
  assert.ok(!listed.some((x) => x.id === e.id), "MCP owner can't list browser escrows");
});

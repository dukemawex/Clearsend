import { test } from "node:test";
import assert from "node:assert/strict";
// TEST FIXTURES only: memory store, stubbed PayPal + Duffel deps. No network.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
import { createTrip, addPassengerDetails, getTrip, type TripRecord } from "../lib/trips";
import { captureAndBook, canPayForTrip, type BookingDeps } from "../lib/trip-booking";
import { closestOffer, duffelTestKey, bookDuffelTest, e164, DuffelBookingError } from "../lib/duffel-booking";

const OWNER = "a".repeat(32);
const PAX = { firstName: "Test", lastName: "Traveller", dateOfBirth: "1990-01-01", email: "t@example.com", phone: "+15555550100", gender: "male" as const, title: "mr" as const };

async function newTrip() {
  const t = await createTrip({ origin: "LOS", destination: "LHR", departureDate: "2026-12-01", airline: "Royal Air Maroc", stops: 1, departureTime: "2026-12-01 11:55 PM", arrivalTime: "9:05 AM", basePrice: 812, currency: "USD", provider: "kernel", priceLabel: "Live market price (Google Flights)", ownerId: OWNER });
  return addPassengerDetails(t.id, PAX);
}
function deps(t: TripRecord, over: Partial<BookingDeps> = {}) {
  const log: string[] = [];
  const d: BookingDeps = {
    getOrder: async () => ({ intent: "CAPTURE", status: "APPROVED", purchase_units: [{ custom_id: `trip:${t.id}`, amount: { value: t.totalPrice.toFixed(2), currency_code: "USD" } }] }),
    captureOrder: async (id) => { log.push(`capture:${id}`); return { purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] }; },
    refundCapture: async (cap, amt, _n, key) => { log.push(`refund:${cap}:${amt?.value}:${key}`); return { id: "REF1", status: "COMPLETED" }; },
    book: async () => { log.push("duffel"); return { orderId: "ord_test1", bookingReference: "ABC123", offerId: "off_1", airline: "Duffel Airways", amount: "800.00", currency: "USD" }; },
    ...over,
  };
  return { d, log };
}

test("only the trip creator (or service key) can pay", async () => {
  const t = await newTrip();
  assert.equal(canPayForTrip(t, OWNER, false), true);
  assert.equal(canPayForTrip(t, "b".repeat(32), false), false);
  assert.equal(canPayForTrip(t, null, true), true);
});

test("capture then Duffel test booking; ref + order on trip and receipt; second call rejected", async () => {
  const t = await newTrip(); const { d, log } = deps(t);
  const r = await captureAndBook(t.id, "ORDER1", d);
  assert.equal(r.ok, true);
  const s = (await getTrip(t.id))!;
  assert.equal(s.state, "confirmed"); assert.equal(s.duffelBookingReference, "ABC123"); assert.equal(s.duffelOrderId, "ord_test1");
  assert.equal(s.receipts?.[0].booking?.bookingReference, "ABC123");
  assert.equal(s.receipts?.[0].booking?.label, "Test booking via Duffel sandbox");
  const again = await captureAndBook(t.id, "ORDER1", d);
  assert.equal(again.ok, false);
  assert.equal(log.filter((x) => x.startsWith("capture")).length, 1);
});

test("order for another trip or wrong amount is refused before capture", async () => {
  const t = await newTrip(); const { d, log } = deps(t, { getOrder: async () => ({ intent: "CAPTURE", status: "APPROVED", purchase_units: [{ custom_id: "trip:other", amount: { value: "1.00", currency_code: "USD" } }] }) });
  const r = await captureAndBook(t.id, "ORDER2", d);
  assert.equal(r.ok, false); assert.equal(log.length, 0);
});

test("Duffel failure auto-refunds the full capture once with an idempotency key", async () => {
  const t = await newTrip(); const { d, log } = deps(t, { book: async () => { throw new Error("Duffel 422: offer expired"); } });
  const r = await captureAndBook(t.id, "ORDER3", d);
  assert.equal(r.ok, false); assert.equal(r.ok === false && r.refunded, true);
  const s = (await getTrip(t.id))!;
  assert.equal(s.state, "refunded"); assert.match(s.refundReason!, /offer expired/);
  assert.deepEqual(log.filter((x) => x.startsWith("refund")), [`refund:CAP1:${t.totalPrice}:trip-${t.id}`]);
  const again = await captureAndBook(t.id, "ORDER3", d);
  assert.equal(again.ok, false); assert.equal(log.filter((x) => x.startsWith("refund")).length, 1);
});

test("refund failure leaves trip failed (money held), never confirmed", async () => {
  const t = await newTrip(); const { d } = deps(t, { book: async () => { throw new Error("down"); }, refundCapture: async () => { throw new Error("PayPal 500"); } });
  const r = await captureAndBook(t.id, "ORDER4", d);
  assert.equal(r.ok, false); assert.equal((await getTrip(t.id))!.state, "failed");
});

test("Duffel: only duffel_test_ keys, closest test offer booked with passenger", async () => {
  assert.throws(() => duffelTestKey({}), /DUFFEL_API_KEY/);
  assert.throws(() => duffelTestKey({ DUFFEL_API_KEY: "duffel_live_x" }), /not a duffel_test_/);
  assert.equal(closestOffer([{ total_amount: "100" }, { total_amount: "790" }, { total_amount: "2000" }], 812)?.total_amount, "790");
  const t = await newTrip(); const bodies: Record<string, unknown>[] = [];
  const f = (async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 201 });
    if (String(url).includes("offer_requests")) return ok({ offers: [{ id: "off_a", total_amount: "300.00", total_currency: "USD", passengers: [{ id: "pas_1" }], owner: { name: "Duffel Airways" } }, { id: "off_b", total_amount: "805.00", total_currency: "USD", passengers: [{ id: "pas_1" }], owner: { name: "Duffel Airways" } }] });
    return ok({ id: "ord_1", booking_reference: "RZPNX8" });
  }) as unknown as typeof fetch;
  const b = await bookDuffelTest(t, { fetchImpl: f, env: { DUFFEL_API_KEY: "duffel_test_x" } });
  assert.deepEqual([b.offerId, b.orderId, b.bookingReference], ["off_b", "ord_1", "RZPNX8"]);
  const order = (bodies[1].data as { passengers: Array<Record<string, string>>; selected_offers: string[] });
  assert.equal(order.passengers[0].id, "pas_1"); assert.equal(order.passengers[0].family_name, "Traveller");
  assert.deepEqual(order.selected_offers, ["off_b"]);
});

test("Duffel: prefers Duffel Airways over other carriers, normalises phone", async () => {
  const t = await newTrip(); const bodies: Record<string, unknown>[] = [];
  const f = (async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 201 });
    if (String(url).includes("offer_requests")) return ok({ offers: [{ id: "off_ba", total_amount: "805.00", total_currency: "USD", passengers: [{ id: "pas_1" }], owner: { name: "British Airways", iata_code: "BA" } }, { id: "off_zz", total_amount: "300.00", total_currency: "USD", passengers: [{ id: "pas_1" }], owner: { name: "Duffel Airways", iata_code: "ZZ" } }] });
    return ok({ id: "ord_1" });
  }) as unknown as typeof fetch;
  const b = await bookDuffelTest(t, { fetchImpl: f, env: { DUFFEL_API_KEY: "duffel_test_x" }, log: () => {} });
  assert.equal(b.offerId, "off_zz");
  assert.match((bodies[1].data as { passengers: Array<Record<string, string>> }).passengers[0].phone_number, /^\+\d+$/);
  assert.equal(e164("0803 123 4567"), "+2348031234567"); assert.equal(e164("+44 (20) 7946-0958"), "+442079460958");
});

test("Duffel: airline internal_error retried once with fresh search + different offer; 4xx not retried", async () => {
  const t = await newTrip(); let orders = 0; let searches = 0;
  const mk = (failStatus: number, type = "airline_error", code = "internal_error") => (async (url: string) => {
    const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 201 });
    if (String(url).includes("offer_requests")) { searches++; return ok({ offers: [{ id: "off_1", total_amount: "300", passengers: [{ id: "p" }], owner: { iata_code: "ZZ" } }, { id: "off_2", total_amount: "310", passengers: [{ id: "p" }], owner: { iata_code: "ZZ" } }] }); }
    orders++;
    if (orders === 1) return new Response(JSON.stringify({ errors: [{ type, code, message: "The airline responded with an internal_error error" }], meta: { request_id: "req_x" } }), { status: failStatus });
    return ok({ id: "ord_ok" });
  }) as unknown as typeof fetch;
  const b = await bookDuffelTest(t, { fetchImpl: mk(502), env: { DUFFEL_API_KEY: "duffel_test_x" }, log: () => {} });
  assert.equal(b.orderId, "ord_ok"); assert.equal(searches, 2); assert.equal(orders, 2);
  orders = 0; searches = 0;
  await assert.rejects(bookDuffelTest(t, { fetchImpl: mk(422, "validation_error", "invalid_phone_number"), env: { DUFFEL_API_KEY: "duffel_test_x" }, log: () => {} }), (e: DuffelBookingError) => e.detail.requestId === "req_x" && /invalid_phone_number/.test(e.message) && !e.retryable);
  assert.equal(orders, 1);
});

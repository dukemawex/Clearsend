import { test } from "node:test";
import assert from "node:assert/strict";
// In-memory trip storage (no Upstash env in tests). No network.
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
import { createTrip, getTrip, addPassengerDetails, setTripFields, parseTripRecord, listTrips } from "../lib/trips";
import { parseGoogleFlightsLabels, dayDiff } from "../lib/kernel-flights";

const PAX = { firstName: "Ada", lastName: "Obi", dateOfBirth: "1990-01-01", email: "ada@example.com", phone: "+2348000000", gender: "female" as const, title: "ms" as const };
const FARE = { origin: "LOS", destination: "LHR", departureDate: "2026-12-01", airline: "RwandAir", airlineCode: null, flightNumber: null, duration: null, stops: 1, departureTime: "2026-12-01 11:55 PM", arrivalTime: "9:05 AM +1 day", basePrice: 427, currency: "USD", provider: "kernel" as const, providerOfferId: null, priceLabel: null, kernelEvidence: { sessionId: null, liveViewUrl: "https://live/s1", replayUrl: null, searchUrl: "https://www.google.com/travel/flights", fetchedAt: 1, parser: "labels" } as never, ownerId: "o1" };

test("null optional fare fields: create -> get -> passenger -> ready to book", async () => {
  const t = await createTrip(FARE as never);
  assert.equal(t.airlineCode, undefined);
  const got = await getTrip(t.id);
  assert.ok(got, "getTrip must parse a trip created from null fields");
  assert.equal(got!.kernelEvidence?.liveViewUrl, "https://live/s1");
  const withPax = await addPassengerDetails(t.id, PAX);
  assert.equal(withPax.state, "payment_pending");
  const booked = await setTripFields(t.id, { paypalOrderId: "ORDER1" });
  assert.equal((await getTrip(t.id))!.paypalOrderId, "ORDER1");
  assert.equal(booked.totalPrice.toFixed(2), "439.81");
  assert.ok((await listTrips("o1")).some((x) => x.id === t.id));
});

test("already-stored records with nulls still parse", () => {
  const stored = { id: "trip_x", ownerId: null, state: "draft", origin: "LOS", destination: "LHR", departureDate: "2026-12-01", airline: "RwandAir", airlineCode: null, flightNumber: null, duration: null, stops: 1, departureTime: "a", arrivalTime: "b", basePrice: 427, serviceFee: 12.81, totalPrice: 439.81, currency: "USD", provider: "kernel", providerOfferId: null, priceLabel: null, kernelEvidence: { sessionId: null, searchUrl: "u", fetchedAt: 1, parser: "p" }, createdAt: 1, updatedAt: 1, timeline: [{ state: "draft", timestamp: 1 }] };
  const r = parseTripRecord(JSON.parse(JSON.stringify(stored)));
  assert.equal(r.airlineCode, undefined);
});

test("overnight arrivals get +N day from Google labels", () => {
  const f = parseGoogleFlightsLabels([
    "From 427 US dollars. 1 stop flight with RwandAir. Leaves Murtala Muhammed International Airport at 11:55 PM on Tuesday, December 1 and arrives at Heathrow Airport at 9:05 AM on Wednesday, December 2. Total duration 10 hr 10 min.",
    "From 74 US dollars. Nonstop flight with Green Africa. Leaves Murtala Muhammed International Airport at 7:00 AM on Tuesday, December 1 and arrives at Nnamdi Azikiwe International Airport at 8:10 AM on Tuesday, December 1. Total duration 1 hr 10 min.",
  ], { origin: "LOS", destination: "LHR", date: "2026-12-01" });
  assert.equal(f[0].arrive, "9:05 AM +1 day");
  assert.equal(f[1].arrive, "8:10 AM");
  assert.equal(dayDiff("Thursday, December 31", "Friday, January 1", "2026-12-31"), 1);
  assert.equal(dayDiff(undefined, "x", "2026-12-01"), 0);
});

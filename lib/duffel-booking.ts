// Duffel TEST-mode booking. Duffel's sandbox only offers sample "Duffel Airways" flights, so ClearSend asks Duffel for the
// same route/date and books the test offer closest in price to the fare the traveller picked. This is labelled
// "Test booking via Duffel sandbox": no real airline ticket is issued. A live Duffel key is refused.
import type { TripRecord } from "./trips";

export const DUFFEL_BOOKING_LABEL = "Test booking via Duffel sandbox";
export type DuffelBooking = { orderId: string; bookingReference?: string; offerId: string; airline: string; amount: string; currency: string };
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

export class DuffelBookingError extends Error { constructor(message: string, public readonly code = "DUFFEL_ERROR") { super(message); this.name = "DuffelBookingError"; } }

export function duffelTestKey(env: Env = process.env): string {
  const k = env.DUFFEL_API_KEY?.trim();
  if (!k) throw new DuffelBookingError("Duffel is not configured: set DUFFEL_API_KEY to a duffel_test_ token.", "NOT_CONFIGURED");
  if (!k.startsWith("duffel_test_")) throw new DuffelBookingError("Refusing to book: DUFFEL_API_KEY is not a duffel_test_ token. ClearSend only makes sandbox test bookings.", "NOT_TEST_KEY");
  return k;
}

/** Pick the offer whose total is closest to the fare the traveller chose (ties: cheapest). */
export function closestOffer<T extends { total_amount?: string }>(offers: T[], target: number): T | null {
  const priced = offers.filter((o) => Number(o.total_amount) > 0);
  if (!priced.length) return null;
  return priced.slice().sort((a, b) => (Math.abs(Number(a.total_amount) - target) - Math.abs(Number(b.total_amount) - target)) || (Number(a.total_amount) - Number(b.total_amount)))[0];
}

export function duffelPassenger(p: NonNullable<TripRecord["passenger"]>, id: string) {
  return { id, type: "adult", title: p.title, given_name: p.firstName, family_name: p.lastName, gender: p.gender === "male" ? "m" : "f", born_on: p.dateOfBirth, email: p.email, phone_number: p.phone };
}

export async function bookDuffelTest(trip: TripRecord, opts: { fetchImpl?: typeof fetch; env?: Env } = {}): Promise<DuffelBooking> {
  const key = duffelTestKey(opts.env);
  const f = opts.fetchImpl ?? fetch;
  if (!trip.passenger) throw new DuffelBookingError("Passenger details are required for the Duffel test booking.", "NO_PASSENGER");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "Duffel-Version": "v2" };
  const call = async (path: string, body: unknown) => {
    const r = await f(`https://api.duffel.com${path}`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
    const j = await r.json().catch(() => ({})) as Json;
    if (!r.ok) { const e = (j.errors as Json[] | undefined)?.[0]; throw new DuffelBookingError(`Duffel ${r.status}: ${String(e?.message ?? e?.title ?? r.statusText)}`, "DUFFEL_HTTP"); }
    return (j.data ?? {}) as Json;
  };
  const req = await call("/air/offer_requests?return_offers=true", { data: { slices: [{ origin: trip.origin, destination: trip.destination, departure_date: trip.departureDate }], passengers: [{ type: "adult" }], cabin_class: "economy" } });
  const offers = (req.offers as Array<Json & { total_amount?: string }> | undefined) ?? [];
  const offer = closestOffer(offers, trip.basePrice);
  if (!offer) throw new DuffelBookingError(`Duffel sandbox returned no test offers for ${trip.origin} → ${trip.destination} on ${trip.departureDate}.`, "NO_OFFERS");
  const paxId = String(((offer.passengers as Json[] | undefined)?.[0]?.id) ?? ((req.passengers as Json[] | undefined)?.[0]?.id) ?? "");
  if (!paxId) throw new DuffelBookingError("Duffel offer had no passenger id.", "NO_PASSENGER_ID");
  const amount = String(offer.total_amount), currency = String(offer.total_currency ?? "USD");
  const order = await call("/air/orders", { data: { type: "instant", selected_offers: [String(offer.id)], passengers: [duffelPassenger(trip.passenger, paxId)], payments: [{ type: "balance", amount, currency }], metadata: { clearsend_trip_id: trip.id, paypal_capture_id: trip.paypalCaptureId ?? "" } } });
  if (!order.id) throw new DuffelBookingError("Duffel did not return an order id.", "NO_ORDER");
  const owner = (offer.owner as Json | undefined)?.name;
  return { orderId: String(order.id), bookingReference: order.booking_reference ? String(order.booking_reference) : undefined, offerId: String(offer.id), airline: String(owner ?? "Duffel Airways"), amount, currency };
}

// Duffel TEST-mode booking. Duffel's sandbox only offers sample "Duffel Airways" flights, so ClearSend asks Duffel for the
// same route/date and books the test offer closest in price to the fare the traveller picked. This is labelled
// "Test booking via Duffel sandbox": no real airline ticket is issued. A live Duffel key is refused.
import type { TripRecord } from "./trips";

export const DUFFEL_BOOKING_LABEL = "Test booking via Duffel sandbox";
export type DuffelBooking = { orderId: string; bookingReference?: string; offerId: string; airline: string; amount: string; currency: string };
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

export type DuffelErrorDetail = { status?: number; type?: string; code?: string; title?: string; message?: string; requestId?: string };
export class DuffelBookingError extends Error {
  constructor(message: string, public readonly code = "DUFFEL_ERROR", public readonly detail: DuffelErrorDetail = {}) { super(message); this.name = "DuffelBookingError"; }
  /** Safe to retry with a fresh offer: airline/Duffel side failure or an offer that went stale. A 5xx/airline_error on POST /air/orders means no order was created. */
  get retryable() { const d = this.detail; return this.code === "DUFFEL_HTTP" && ((d.status ?? 0) >= 500 || d.type === "airline_error" || d.code === "offer_no_longer_available" || d.code === "price_changed" || d.code === "offer_expired"); }
}

/** Duffel Airways (ZZ) is the only reliable bookable carrier in test mode; other carriers hit external airline sandboxes. */
export const isDuffelAirways = (o: Json) => { const ow = (o.owner ?? {}) as Json; return ow.iata_code === "ZZ" || ow.name === "Duffel Airways"; };

/** Normalise to E.164 (Duffel requires e.g. +2348012345678). Nigerian local 0XXXXXXXXXX -> +234XXXXXXXXXX. */
export function e164(phone: string): string {
  let d = phone.trim().replace(/[\s().-]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+") && /^0\d{10}$/.test(d)) d = "+234" + d.slice(1);
  if (!d.startsWith("+")) d = "+" + d;
  return d;
}

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
  return { id, type: "adult", title: p.title, given_name: p.firstName, family_name: p.lastName, gender: p.gender === "male" ? "m" : "f", born_on: p.dateOfBirth, email: p.email, phone_number: e164(p.phone) };
}

/** Prefer Duffel Airways offers (closest in price); only fall back to other carriers if Duffel Airways returned none. */
export function pickOffer<T extends Json & { total_amount?: string }>(offers: T[], target: number, exclude: Set<string> = new Set()): T | null {
  const avail = offers.filter((o) => !exclude.has(String(o.id)));
  return closestOffer(avail.filter(isDuffelAirways), target) ?? closestOffer(avail, target);
}

export async function bookDuffelTest(trip: TripRecord, opts: { fetchImpl?: typeof fetch; env?: Env; maxAttempts?: number; log?: (m: string, d: unknown) => void } = {}): Promise<DuffelBooking> {
  const key = duffelTestKey(opts.env);
  const f = opts.fetchImpl ?? fetch;
  const log = opts.log ?? ((m, d) => console.error(m, JSON.stringify(d)));
  if (!trip.passenger) throw new DuffelBookingError("Passenger details are required for the Duffel test booking.", "NO_PASSENGER");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "Duffel-Version": "v2" };
  const call = async (path: string, body: unknown) => {
    const r = await f(`https://api.duffel.com${path}`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
    const j = await r.json().catch(() => ({})) as Json;
    if (!r.ok) {
      const e = ((j.errors as Json[] | undefined)?.[0] ?? {}) as Json;
      const detail: DuffelErrorDetail = { status: r.status, type: e.type as string, code: e.code as string, title: e.title as string, message: e.message as string, requestId: ((j.meta as Json | undefined)?.request_id as string) ?? r.headers?.get?.("x-request-id") ?? undefined };
      log("[duffel] error", { path: path.split("?")[0], trip: trip.id, ...detail });
      throw new DuffelBookingError(`Duffel ${r.status}${detail.type ? ` ${detail.type}` : ""}${detail.code ? `/${detail.code}` : ""}: ${String(detail.message ?? detail.title ?? r.statusText)}${detail.requestId ? ` (request ${detail.requestId})` : ""}`, "DUFFEL_HTTP", detail);
    }
    return (j.data ?? {}) as Json;
  };
  const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 3, 3));
  const tried = new Set<string>();
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Fresh search every attempt so the offer is never stale (offers expire ~20-30 min).
    const req = await call("/air/offer_requests?return_offers=true", { data: { slices: [{ origin: trip.origin, destination: trip.destination, departure_date: trip.departureDate }], passengers: [{ type: "adult" }], cabin_class: "economy" } });
    const offers = (req.offers as Array<Json & { total_amount?: string }> | undefined) ?? [];
    const offer = pickOffer(offers, trip.basePrice, tried);
    if (!offer) { if (last) throw last; throw new DuffelBookingError(`Duffel sandbox returned no test offers for ${trip.origin} → ${trip.destination} on ${trip.departureDate}.`, "NO_OFFERS"); }
    tried.add(String(offer.id));
    const paxId = String(((offer.passengers as Json[] | undefined)?.[0]?.id) ?? ((req.passengers as Json[] | undefined)?.[0]?.id) ?? "");
    if (!paxId) throw new DuffelBookingError("Duffel offer had no passenger id.", "NO_PASSENGER_ID");
    const amount = String(offer.total_amount), currency = String(offer.total_currency ?? "USD");
    try {
      const order = await call("/air/orders", { data: { type: "instant", selected_offers: [String(offer.id)], passengers: [duffelPassenger(trip.passenger, paxId)], payments: [{ type: "balance", amount, currency }], metadata: { clearsend_trip_id: trip.id, paypal_capture_id: trip.paypalCaptureId ?? "", attempt: String(attempt) } } });
      if (!order.id) throw new DuffelBookingError("Duffel did not return an order id.", "NO_ORDER");
      const owner = (offer.owner as Json | undefined)?.name;
      return { orderId: String(order.id), bookingReference: order.booking_reference ? String(order.booking_reference) : undefined, offerId: String(offer.id), airline: String(owner ?? "Duffel Airways"), amount, currency };
    } catch (e) {
      last = e;
      if (!(e instanceof DuffelBookingError && e.retryable) || attempt === maxAttempts) throw e;
      log("[duffel] retrying with fresh offer", { trip: trip.id, attempt, offer: String(offer.id), owner: (offer.owner as Json | undefined)?.iata_code });
    }
  }
  throw last;
}

// Trip money flow: PayPal sandbox order (custom_id trip:<id>) -> capture -> Duffel TEST booking -> receipt,
// or an automatic, idempotent PayPal refund if the Duffel test booking fails. One lock, one order, one settlement per trip.
import { checkOrderMatchesEscrow } from "./order-check";
import { bookDuffelTest, type DuffelBooking } from "./duffel-booking";
import * as paypal from "./paypal";
import * as trips from "./trips";
import type { TripRecord } from "./trips";

export type BookingDeps = {
  getOrder: (id: string) => Promise<unknown>;
  captureOrder: (id: string) => Promise<Record<string, unknown>>;
  refundCapture: typeof paypal.refundCapture;
  book: (t: TripRecord) => Promise<DuffelBooking>;
};
const defaultDeps: BookingDeps = { getOrder: paypal.getOrder, captureOrder: paypal.captureOrder, refundCapture: paypal.refundCapture, book: (t) => bookDuffelTest(t) };

export type BookingOutcome =
  | { ok: true; state: "confirmed"; trip: TripRecord; captureId: string; booking: DuffelBooking }
  | { ok: false; status: number; error: string; state?: string; refunded?: boolean; refundId?: string; trip?: TripRecord };

/** The trip creator's browser (cs_uid == trip.ownerId) is the payer. */
export function canPayForTrip(trip: Pick<TripRecord, "ownerId">, owner: string | null, service: boolean) {
  return service || (!!owner && !!trip.ownerId && owner === trip.ownerId);
}

export async function captureAndBook(tripId: string, orderId: string, deps: BookingDeps = defaultDeps): Promise<BookingOutcome> {
  return trips.withTripLock(tripId, async () => {
    let trip = await trips.getTrip(tripId);
    if (!trip) return { ok: false, status: 404, error: "Trip not found" };
    if (trip.state === "confirmed" || trip.state === "refunded") return { ok: false, status: 409, error: `Trip is already ${trip.state}`, state: trip.state, trip };

    // 1. Capture once (resume if a previous attempt captured but did not finish).
    let captureId = trip.paypalCaptureId;
    if (!captureId) {
      if (trip.state !== "payment_pending") return { ok: false, status: 409, error: `Trip is ${trip.state}, expected payment_pending` };
      const order = await deps.getOrder(orderId);
      const why = checkOrderMatchesEscrow(order, { id: trip.id, amount: trip.totalPrice, currency: trip.currency }, "trip");
      if (why) return { ok: false, status: 400, error: `PayPal order rejected: ${why}` };
      if (!(await trips.bindOrderToTrip(orderId, trip.id))) return { ok: false, status: 409, error: "This PayPal order already paid for another trip" };
      const cap = await deps.captureOrder(orderId);
      const c = (cap as { purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }> }).purchase_units?.[0]?.payments?.captures?.[0];
      if (!c?.id) return { ok: false, status: 502, error: "PayPal did not return a capture id" };
      captureId = c.id;
      await trips.markPaymentApproved(trip.id, orderId, captureId, undefined, c.status);
      trip = await trips.markTicketing(trip.id);
    } else if (trip.paypalOrderId && trip.paypalOrderId !== orderId) {
      return { ok: false, status: 409, error: "Trip was paid with a different PayPal order" };
    }

    // 2. One settlement per trip: book or refund, never both.
    const claim = await trips.claimTripSettlement(trip.id, "book");
    if (!claim.ok) return { ok: false, status: 409, error: `Trip was already settled (${claim.by})`, trip: (await trips.getTrip(trip.id)) ?? undefined };

    try {
      const b = await deps.book((await trips.getTrip(trip.id))!);
      const done = await trips.confirmTrip(trip.id, b.orderId, b.bookingReference, undefined, { duffelOfferId: b.offerId, duffelTestAirline: b.airline, duffelTestAmount: `${b.amount} ${b.currency}`, bookingMode: "duffel_test" });
      return { ok: true, state: "confirmed", trip: done, captureId, booking: b };
    } catch (e) {
      const reason = `Test booking via Duffel sandbox failed: ${(e as Error).message}`;
      await trips.setTripFields(trip.id, { bookingError: reason });
      try {
        // Idempotent: PayPal-Request-Id is derived from the trip id, so a retry cannot refund twice.
        const r = await deps.refundCapture(captureId, { value: trip.totalPrice, currency: trip.currency }, "ClearSend: flight test booking failed", `trip-${trip.id}`);
        const refundId = (r as { id?: string }).id;
        if (!refundId) throw new Error("PayPal returned no refund id");
        const refunded = await trips.refundTrip(trip.id, refundId, reason, (r as { status?: string }).status);
        return { ok: false, status: 502, error: `${reason}. Your PayPal sandbox payment was refunded automatically.`, refunded: true, refundId, state: "refunded", trip: refunded };
      } catch (re) {
        const failed = await trips.failTrip(trip.id, `${reason}. Automatic refund also failed: ${(re as Error).message}`);
        return { ok: false, status: 502, error: `${reason}. The automatic refund also failed; the payment is still held.`, state: "failed", trip: failed };
      }
    }
  });
}

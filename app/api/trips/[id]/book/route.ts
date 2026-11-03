import { NextResponse } from "next/server";
import { getTrip, setTripFields, TripError } from "@/lib/trips";
import { approveLink, captureErrorMessage, createOrder as createPayPalOrder, PayPalError } from "@/lib/paypal";
import { ownerFromRequest } from "@/lib/owner";
import { hasServiceKey } from "@/lib/escrow-auth";
import { canPayForTrip, captureAndBook } from "@/lib/trip-booking";

export const runtime = "nodejs";
export const maxDuration = 60;

const forbidden = () => NextResponse.json({ error: "Only the traveller who created this trip can pay for it" }, { status: 403 });

/** Payer only (creator's cs_uid cookie or service key). Creates the PayPal sandbox order bound to this trip (custom_id trip:<id>). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const trip = await getTrip(id);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    if (!canPayForTrip(trip, ownerFromRequest(request), hasServiceKey(request))) return forbidden();
    if (trip.state !== "payment_pending") return NextResponse.json({ error: `Trip is in ${trip.state} state, expected payment_pending` }, { status: 409 });
    if (!(trip.totalPrice > 0)) return NextResponse.json({ error: "This trip has no real fare and cannot be paid" }, { status: 400 });
    const order = await createPayPalOrder({ amount: trip.totalPrice, currency: trip.currency, description: `Flight ${trip.origin} to ${trip.destination} on ${trip.departureDate} (sandbox test booking)`, returnTo: { kind: "trip", id: trip.id } });
    await setTripFields(trip.id, { paypalOrderId: order.id as string });
    return NextResponse.json({ tripId: trip.id, orderId: order.id, status: order.status, approveUrl: approveLink(order), amount: trip.totalPrice, currency: trip.currency });
  } catch (error) {
    console.error("trips_book_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to initiate booking" }, { status: error instanceof PayPalError ? 502 : 500 });
  }
}

/** Payer only. Body { orderId, confirmation: "CAPTURE" }. Verifies + captures the order once, then makes the Duffel test booking;
 * if Duffel fails the capture is refunded automatically. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({})) as { orderId?: unknown; confirmation?: unknown };
    if (typeof body.orderId !== "string" || !body.orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    if (typeof body.confirmation !== "string" || body.confirmation.trim().toUpperCase() !== "CAPTURE") return NextResponse.json({ error: 'Confirmation required: send confirmation "CAPTURE"', confirmationRequired: "CAPTURE" }, { status: 400 });
    const trip = await getTrip(id);
    if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    if (!canPayForTrip(trip, ownerFromRequest(request), hasServiceKey(request))) return forbidden();
    const r = await captureAndBook(id, body.orderId);
    if (r.ok) return NextResponse.json({ success: true, tripId: id, state: r.state, captureId: r.captureId, duffelOrderId: r.booking.orderId, bookingReference: r.booking.bookingReference, bookingLabel: "Test booking via Duffel sandbox" });
    return NextResponse.json({ success: false, tripId: id, error: r.error, state: r.state, refunded: r.refunded, refundId: r.refundId }, { status: r.status });
  } catch (error) {
    if (error instanceof TripError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "BUSY" ? 409 : 400 });
    console.error("trips_capture_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: captureErrorMessage(error) }, { status: error instanceof PayPalError ? 502 : 500 });
  }
}

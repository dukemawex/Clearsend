import { NextResponse } from "next/server";
import { addPassengerDetails, getTrip, PassengerDetails } from "@/lib/trips";
import { ownerFromRequest } from "@/lib/owner";
import { hasServiceKey } from "@/lib/escrow-auth";
import { canPayForTrip } from "@/lib/trip-booking";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const trip = await getTrip(id);
    if (!trip || !canPayForTrip(trip, ownerFromRequest(request), hasServiceKey(request))) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    if (!["draft", "passenger_details_pending", "payment_pending"].includes(trip.state) || trip.paypalCaptureId) return NextResponse.json({ error: `Trip is ${trip.state}; passenger details can no longer change` }, { status: 409 });
    const body = await request.json();
    const passenger = PassengerDetails.parse(body);
    const updated = await addPassengerDetails(id, passenger);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("trips_passenger_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add passenger details" },
      { status: 400 }
    );
  }
}

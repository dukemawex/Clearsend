import { NextResponse } from "next/server";
import { getTrip } from "@/lib/trips";
import { ownerFromRequest } from "@/lib/owner";
import { hasServiceKey } from "@/lib/activity";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const trip = await getTrip(id);
    // Trips are private to the browser that created them (cs_uid cookie). Legacy trips without an owner are hidden.
    if (trip && !hasServiceKey(request) && (!trip.ownerId || trip.ownerId !== ownerFromRequest(request))) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    return NextResponse.json(trip);
  } catch (error) {
    console.error("trips_get_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get trip" },
      { status: 500 }
    );
  }
}

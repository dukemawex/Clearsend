import { NextResponse } from "next/server";
import { getTrip } from "@/lib/trips";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const trip = await getTrip(id);
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

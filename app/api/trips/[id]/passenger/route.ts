import { NextResponse } from "next/server";
import { addPassengerDetails, PassengerDetails } from "@/lib/trips";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const passenger = PassengerDetails.parse(body);
    const trip = await addPassengerDetails(id, passenger);
    return NextResponse.json(trip);
  } catch (error) {
    console.error("trips_passenger_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add passenger details" },
      { status: 400 }
    );
  }
}

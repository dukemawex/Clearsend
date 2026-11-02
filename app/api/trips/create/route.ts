import { NextResponse } from "next/server";
import { createTrip } from "@/lib/trips";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trip = await createTrip(body);
    return NextResponse.json(trip, { status: 201 });
  } catch (error) {
    console.error("trips_create_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create trip" },
      { status: 500 }
    );
  }
}

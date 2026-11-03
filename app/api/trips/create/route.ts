import { NextResponse } from "next/server";
import { createTrip } from "@/lib/trips";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!(typeof body?.basePrice === "number" && body.basePrice > 0)) return NextResponse.json({ error: "Only flights with a real fare can be booked" }, { status: 400 });
    if (!["kernel", "duffel", "rapidapi"].includes(body?.provider)) return NextResponse.json({ error: "This fare source cannot be booked" }, { status: 400 });
    if (body.provider === "kernel") body.priceLabel = "Live market price (Google Flights)";
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

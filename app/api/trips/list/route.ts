import { NextResponse } from "next/server";
import { listTrips } from "@/lib/trips";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;
    
    const trips = await listTrips(userId);
    return NextResponse.json(trips);
  } catch (error) {
    console.error("trips_list_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list trips" },
      { status: 500 }
    );
  }
}

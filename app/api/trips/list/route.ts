import { NextResponse } from "next/server";
import { listTrips } from "@/lib/trips";
import { ownerFromRequest } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;
    
    const trips = await listTrips(ownerFromRequest(request), userId);
    return NextResponse.json(trips);
  } catch (error) {
    console.error("trips_list_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list trips" },
      { status: 500 }
    );
  }
}

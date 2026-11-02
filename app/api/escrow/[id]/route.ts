import { NextRequest, NextResponse } from "next/server";
import { getEscrow } from "@/lib/escrow";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const escrow = await getEscrow(id);
    
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    
    return NextResponse.json(escrow);
  } catch (error) {
    console.error("escrow_get_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to get escrow" }, { status: 500 });
  }
}

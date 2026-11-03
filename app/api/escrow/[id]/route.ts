import { NextRequest, NextResponse } from "next/server";
import { getEscrow } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Check for service key
    const serviceKey = request.headers.get("x-clearsend-api-key");
    const hasValidServiceKey = serviceKey && serviceKey === process.env.CLEAR_SEND_API_KEY;
    
    if (!hasValidServiceKey) {
      // Require role + token
      const { searchParams } = new URL(request.url);
      const role = searchParams.get("role") as EscrowRole | null;
      const token = searchParams.get("token");
      
      if (!role || !token) {
        return NextResponse.json({ error: "Missing role or token" }, { status: 401 });
      }
      
      if (!verifyEscrowToken(id, role, token)) {
        return NextResponse.json({ error: "Invalid token for this role" }, { status: 403 });
      }
    }

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

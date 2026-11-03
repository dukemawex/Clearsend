import { NextRequest, NextResponse } from "next/server";
import { refundEscrow, getEscrow } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";
import { refundCapture } from "@/lib/paypal";
import { z } from "zod";

const RefundEscrowSchema = z.object({
  escrowId: z.string(),
  reason: z.string().optional(),
  role: z.string().optional(),
  token: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, reason, role, token } = RefundEscrowSchema.parse(body);
    
    const serviceKey = request.headers.get("x-clearsend-api-key");
    const hasValidServiceKey = serviceKey && serviceKey === process.env.CLEAR_SEND_API_KEY;
    
    if (!hasValidServiceKey) {
      if (!role || !token) {
        return NextResponse.json({ error: "Missing role or token" }, { status: 401 });
      }
      
      if (!verifyEscrowToken(escrowId, role as EscrowRole, token)) {
        return NextResponse.json({ error: "Invalid token for this role" }, { status: 403 });
      }
    }
    
    const escrow = await getEscrow(escrowId);
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    
    if (!["funded", "submitted", "rejected"].includes(escrow.state)) {
      return NextResponse.json({ error: `Escrow is ${escrow.state}, cannot refund` }, { status: 400 });
    }
    
    if (!escrow.captureId) {
      return NextResponse.json({ error: "No capture ID found, cannot refund" }, { status: 400 });
    }
    
    const refundResult = await refundCapture(
      escrow.captureId,
      { value: escrow.amount.toFixed(2), currency: escrow.currency },
      reason || "ClearSend Escrow refund"
    );
    
    const refundId = refundResult.id as string | undefined;
    if (!refundId) {
      return NextResponse.json({ error: "Refund ID not found in PayPal response" }, { status: 500 });
    }
    
    const updated = await refundEscrow(escrowId, refundId);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_refund_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to refund escrow" }, { status: 500 });
  }
}

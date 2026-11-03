import { NextRequest, NextResponse } from "next/server";
import { submitDeliverable } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";
import { z } from "zod";

const SubmitDeliverableSchema = z.object({
  escrowId: z.string(),
  deliverable: z.string().default(""),
  role: z.string().optional(),
  token: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, deliverable, role, token } = SubmitDeliverableSchema.parse(body);
    
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
    
    const updated = await submitDeliverable(escrowId, deliverable);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_submit_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to submit deliverable" }, { status: 500 });
  }
}

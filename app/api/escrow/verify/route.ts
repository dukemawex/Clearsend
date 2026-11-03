import { NextRequest, NextResponse } from "next/server";
import { verifyDeliverable, getEscrow } from "@/lib/escrow";
import { authorizeEscrow } from "@/lib/escrow-auth";
import { z } from "zod";
import { evaluateEscrow } from "@/lib/verifier";

const VerifyDeliverableSchema = z.object({
  escrowId: z.string(),
  role: z.string().optional(),
  token: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, role, token } = VerifyDeliverableSchema.parse(body);
    
    const target = await getEscrow(escrowId);
    if (!target) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    const auth = authorizeEscrow(request, target, "verify", { role, token });
    if (!auth.ok) return auth.res;
    
    const escrow = await getEscrow(escrowId);
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    
    if (escrow.state !== "submitted") {
      return NextResponse.json({ error: `Escrow is ${escrow.state}, expected 'submitted'` }, { status: 400 });
    }
    
    if (!escrow.deliverable) {
      return NextResponse.json({ error: "No deliverable found" }, { status: 400 });
    }
    
    const evaluationResult = await evaluateEscrow(escrow);
    
    const updated = await verifyDeliverable(escrowId, evaluationResult);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_verify_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to verify deliverable" }, { status: 500 });
  }
}

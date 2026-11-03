import { NextRequest, NextResponse } from "next/server";
import { getEscrow, submitDeliverable } from "@/lib/escrow";
import { authorizeEscrow } from "@/lib/escrow-auth";
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
    
    const target = await getEscrow(escrowId);
    if (!target) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    const auth = authorizeEscrow(request, target, "submit", { role, token });
    if (!auth.ok) return auth.res;
    
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

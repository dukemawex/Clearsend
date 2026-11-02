import { NextRequest, NextResponse } from "next/server";
import { submitDeliverable } from "@/lib/escrow";
import { z } from "zod";

const SubmitDeliverableSchema = z.object({
  escrowId: z.string(),
  deliverable: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, deliverable } = SubmitDeliverableSchema.parse(body);
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

import { NextRequest, NextResponse } from "next/server";
import { createEscrow } from "@/lib/escrow";
import { z } from "zod";

const CreateEscrowSchema = z.object({
  payer: z.string(),
  payerEmail: z.string().email(),
  recipient: z.string(),
  recipientEmail: z.string().email().optional(),
  recipientPayerId: z.string().optional(),
  recipientCountry: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  specification: z.string(),
  acceptanceCriteria: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = CreateEscrowSchema.parse(body);
    const escrow = await createEscrow(input);
    return NextResponse.json(escrow, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_create_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create escrow" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createEscrow, EscrowError } from "@/lib/escrow";
import { createEscrowLink } from "@/lib/escrow-links";
import { z } from "zod";
import { StructuredSpec } from "@/lib/spec";

const CreateEscrowSchema = z.object({
  payer: z.string(),
  payerEmail: z.string().email(),
  recipient: z.string(),
  recipientEmail: z.string().email().optional(),
  recipientPayerId: z.string().max(13).optional(),
  recipientPhone: z.string().max(20).optional(),
  recipientType: z.enum(["EMAIL", "PHONE", "PAYPAL_ID"]).optional(),
  receiveCurrency: z.string().length(3).optional(),
  recipientCountry: z.string().min(2).max(2),
  amount: z.number().positive(),
  currency: z.string().length(3),
  specification: z.string(),
  acceptanceCriteria: z.array(z.string().max(500)).max(30).optional(),
  structuredSpec: StructuredSpec.optional(),
  specDocument: z.object({ name: z.string().max(120), kind: z.string().max(10), size: z.number().nonnegative(), text: z.string().max(20_000), truncated: z.boolean(), method: z.string().max(20), note: z.string().max(500).optional(), uploadedAt: z.number() }).optional(),
});

function getPublicBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  const origin = request.headers.get("origin") || request.headers.get("referer");
  if (origin) {
    try {
      const url = new URL(origin);
      if (!url.hostname.includes("localhost")) {
        return `${url.protocol}//${url.host}`;
      }
    } catch {
      // Invalid URL, continue to fallback
    }
  }
  
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = CreateEscrowSchema.parse(body);
    const escrow = await createEscrow(input);
    
    const baseUrl = getPublicBaseUrl(request);
    const links = {
      payer: createEscrowLink(escrow.id, "payer", baseUrl),
      recipient: createEscrowLink(escrow.id, "recipient", baseUrl),
      verifier: createEscrowLink(escrow.id, "verifier", baseUrl),
    };
    
    return NextResponse.json({ ...escrow, links }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    if (error instanceof EscrowError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    console.error("escrow_create_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create escrow" }, { status: 500 });
  }
}

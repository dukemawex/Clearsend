import { NextRequest, NextResponse } from "next/server";
import { notifyReceipt } from "@/lib/chatbots/notify";
import { releaseEscrow, getEscrow } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";
import { createPayout } from "@/lib/paypal";
import { z } from "zod";

const ReleaseEscrowSchema = z.object({
  escrowId: z.string(),
  role: z.string().optional(),
  token: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, role, token } = ReleaseEscrowSchema.parse(body);
    
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
    
    if (escrow.state !== "verified") {
      return NextResponse.json({ error: `Escrow is ${escrow.state}, expected 'verified'` }, { status: 400 });
    }
    
    if (!escrow.recipientEmail && !escrow.recipientPayerId) {
      return NextResponse.json({ error: "No recipient email or PayPal ID configured" }, { status: 400 });
    }
    
    const payoutResult = await createPayout({
      recipientEmail: escrow.recipientEmail || escrow.recipientPayerId!,
      amount: escrow.amount,
      currency: escrow.currency,
      note: `ClearSend Escrow Release: ${escrow.specification.slice(0, 100)}`,
    });
    
    const batchId = payoutResult.batch_header?.payout_batch_id as string | undefined;
    const itemId = payoutResult.items?.[0]?.payout_item_id as string | undefined;
    
    if (!batchId) {
      return NextResponse.json({ error: "Payout batch ID not found in PayPal response" }, { status: 500 });
    }
    
    const updated = await releaseEscrow(escrowId, batchId, itemId, payoutResult.batch_header?.batch_status as string | undefined);
    await notifyReceipt(updated, "payout");
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_release_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to release escrow" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fundEscrow, getEscrow } from "@/lib/escrow";
import { captureOrder, createOrder } from "@/lib/paypal";
import { z } from "zod";

const FundEscrowSchema = z.object({
  escrowId: z.string(),
  orderId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { escrowId, orderId } = FundEscrowSchema.parse(body);
    
    const escrow = await getEscrow(escrowId);
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    
    let finalOrderId = orderId;
    if (!finalOrderId) {
      const order = await createOrder({
        amount: escrow.amount,
        currency: escrow.currency,
        returnTo: { kind: "escrow", id: escrowId },
        description: `ClearSend Escrow ${escrowId} - ${escrow.specification.slice(0, 100)}`,
      });
      finalOrderId = order.id as string;
      const links = order.links as Array<{ rel: string; href: string }> | undefined;
      const approveUrl = links?.find((l) => l.rel === "approve")?.href;
      
      return NextResponse.json({
        orderId: finalOrderId,
        status: order.status,
        approveUrl,
        message: "Order created. User must approve payment in PayPal before capturing.",
      });
    }
    
    const captureResult = await captureOrder(finalOrderId);
    const captureId = (captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id) as string | undefined;
    
    if (!captureId) {
      return NextResponse.json({ error: "Capture ID not found in PayPal response" }, { status: 500 });
    }
    
    const updated = await fundEscrow(escrowId, finalOrderId, captureId);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("escrow_fund_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fund escrow" }, { status: 500 });
  }
}

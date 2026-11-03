import { NextRequest, NextResponse } from "next/server";
import { notifyReceipt } from "@/lib/chatbots/notify";
import { bindOrderToEscrow, EscrowError, fundEscrow, getEscrow, withEscrowLock } from "@/lib/escrow";
import { authorizeEscrow } from "@/lib/escrow-auth";
import { checkOrderMatchesEscrow } from "@/lib/order-check";
import { captureErrorMessage, captureOrder, createOrder, getOrder, PayPalError } from "@/lib/paypal";
import { z } from "zod";

const FundEscrowSchema = z.object({
  escrowId: z.string(),
  orderId: z.string().min(1).max(64).optional(),
  role: z.string().optional(),
  token: z.string().optional(),
});

/** Payer-only. Without orderId: create a PayPal order bound to this escrow (custom_id escrow:<id>).
 * With orderId: verify the order belongs to this escrow (custom_id, amount, currency, not used elsewhere), then capture once. */
export async function POST(request: NextRequest) {
  try {
    const { escrowId, orderId, role, token } = FundEscrowSchema.parse(await request.json());
    const escrow = await getEscrow(escrowId);
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    const auth = authorizeEscrow(request, escrow, "fund", { role, token });
    if (!auth.ok) return auth.res;
    if (escrow.state !== "created") return NextResponse.json({ error: `Escrow is already ${escrow.state}` }, { status: 409 });

    if (!orderId) {
      const order = await createOrder({ amount: escrow.amount, currency: escrow.currency, returnTo: { kind: "escrow", id: escrowId }, description: `ClearSend Escrow ${escrowId} - ${escrow.specification.slice(0, 100)}` });
      const links = order.links as Array<{ rel: string; href: string }> | undefined;
      const approveUrl = links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
      return NextResponse.json({ orderId: order.id, status: order.status, approveUrl, message: "Order created. User must approve payment in PayPal before capturing." });
    }

    return await withEscrowLock(escrowId, async () => {
      const fresh = await getEscrow(escrowId);
      if (!fresh || fresh.state !== "created") return NextResponse.json({ error: `Escrow is already ${fresh?.state ?? "gone"}` }, { status: 409 });
      const order = await getOrder(orderId);
      const mismatch = checkOrderMatchesEscrow(order, fresh);
      if (mismatch) return NextResponse.json({ error: `PayPal order rejected: ${mismatch}` }, { status: 422 });
      if (!(await bindOrderToEscrow(orderId, escrowId))) return NextResponse.json({ error: "PayPal order rejected: it is already used for another escrow" }, { status: 409 });

      const captureResult = await captureOrder(orderId);
      const cap = captureResult.purchase_units?.[0]?.payments?.captures?.[0] as { id?: string; status?: string; amount?: { value?: string; currency_code?: string } } | undefined;
      if (!cap?.id) return NextResponse.json({ error: "Capture ID not found in PayPal response" }, { status: 502 });
      const updated = await fundEscrow(escrowId, orderId, cap.id, cap.status ?? (captureResult.status as string | undefined));
      await notifyReceipt(updated, "funding");
      return NextResponse.json(updated);
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    if (error instanceof EscrowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "BUSY" ? 409 : 400 });
    console.error("escrow_fund_error", error instanceof Error ? error.message : error);
    if (error instanceof PayPalError) return NextResponse.json({ error: captureErrorMessage(error), retry: true }, { status: error.status >= 400 && error.status < 500 ? 422 : 502 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fund escrow" }, { status: 500 });
  }
}

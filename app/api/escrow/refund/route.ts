import { NextRequest, NextResponse } from "next/server";
import { notifyReceipt } from "@/lib/chatbots/notify";
import { claimSettlement, EscrowError, getEscrow, refundEscrow, releaseSettlementClaim, withEscrowLock } from "@/lib/escrow";
import { authorizeEscrow, confirmationMatches, requiredConfirmation } from "@/lib/escrow-auth";
import { PayPalError, refundCapture } from "@/lib/paypal";
import { z } from "zod";

const RefundEscrowSchema = z.object({
  escrowId: z.string(),
  reason: z.string().max(200).optional(),
  role: z.string().optional(),
  token: z.string().optional(),
  /** Must be exactly "REFUND <amount> <CUR>", e.g. "REFUND 5.00 USD". Checked server-side. */
  confirmation: z.string().max(64).optional(),
});

/** Payer or verifier (same rule as Telegram and the README). */
export async function POST(request: NextRequest) {
  try {
    const { escrowId, reason, role, token, confirmation } = RefundEscrowSchema.parse(await request.json());
    const escrow = await getEscrow(escrowId);
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    const auth = authorizeEscrow(request, escrow, "refund", { role, token });
    if (!auth.ok) return auth.res;
    const want = requiredConfirmation("refund", escrow.amount, escrow.currency);
    if (!confirmationMatches(confirmation, want)) return NextResponse.json({ error: `Confirmation required: send confirmation "${want}" exactly`, confirmationRequired: want }, { status: 400 });

    return await withEscrowLock(escrowId, async () => {
      const fresh = await getEscrow(escrowId);
      if (!fresh || !["funded", "submitted", "rejected"].includes(fresh.state)) return NextResponse.json({ error: `Escrow is ${fresh?.state ?? "gone"}, cannot refund` }, { status: 409 });
      if (!fresh.captureId) return NextResponse.json({ error: "No capture ID found, cannot refund" }, { status: 400 });
      const claim = await claimSettlement(escrowId, "refund");
      if (!claim.ok) return NextResponse.json({ error: `Escrow was already settled (${claim.by})` }, { status: 409 });
      let refundResult;
      try {
        refundResult = await refundCapture(fresh.captureId, { value: fresh.amount, currency: fresh.currency }, reason || "ClearSend Escrow refund", fresh.id);
      } catch (e) {
        if (e instanceof PayPalError && e.status >= 400 && e.status < 500) await releaseSettlementClaim(escrowId);
        throw e;
      }
      const refundId = refundResult.id as string | undefined;
      if (!refundId) return NextResponse.json({ error: "Refund ID not found in PayPal response" }, { status: 502 });
      const updated = await refundEscrow(escrowId, refundId, refundResult.status as string | undefined);
      await notifyReceipt(updated, "refund");
      return NextResponse.json(updated);
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    if (error instanceof EscrowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "BUSY" ? 409 : 400 });
    console.error("escrow_refund_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to refund escrow" }, { status: error instanceof PayPalError ? 502 : 500 });
  }
}

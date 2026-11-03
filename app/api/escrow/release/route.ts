import { NextRequest, NextResponse } from "next/server";
import { notifyReceipt } from "@/lib/chatbots/notify";
import { claimSettlement, EscrowError, getEscrow, payoutReceiver, releaseEscrow, releaseSettlementClaim, withEscrowLock } from "@/lib/escrow";
import { authorizeEscrow, confirmationMatches, requiredConfirmation } from "@/lib/escrow-auth";
import { createPayout, PayPalError } from "@/lib/paypal";
import { z } from "zod";

const ReleaseEscrowSchema = z.object({
  escrowId: z.string(),
  role: z.string().optional(),
  token: z.string().optional(),
  /** Must be exactly "RELEASE <amount> <CUR>", e.g. "RELEASE 5.00 USD". Checked server-side. */
  confirmation: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { escrowId, role, token, confirmation } = ReleaseEscrowSchema.parse(await request.json());
    const escrow = await getEscrow(escrowId);
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    const auth = authorizeEscrow(request, escrow, "release", { role, token });
    if (!auth.ok) return auth.res;
    const want = requiredConfirmation("release", escrow.amount, escrow.currency);
    if (!confirmationMatches(confirmation, want)) return NextResponse.json({ error: `Confirmation required: send confirmation "${want}" exactly`, confirmationRequired: want }, { status: 400 });

    return await withEscrowLock(escrowId, async () => {
      const fresh = await getEscrow(escrowId);
      if (!fresh || fresh.state !== "verified") return NextResponse.json({ error: `Escrow is ${fresh?.state ?? "gone"}, expected 'verified'` }, { status: 409 });
      const rcv = payoutReceiver(fresh);
      if (!rcv) return NextResponse.json({ error: "No recipient PayPal email, phone or PayPal ID configured" }, { status: 400 });
      const claim = await claimSettlement(escrowId, "release");
      if (!claim.ok) return NextResponse.json({ error: `Escrow was already settled (${claim.by})` }, { status: 409 });
      let payoutResult;
      try {
        payoutResult = await createPayout({ ...rcv, amount: fresh.amount, currency: fresh.currency, note: `ClearSend Escrow Release: ${fresh.specification.slice(0, 100)}`, senderItemId: fresh.id });
      } catch (e) {
        // PayPal refused the batch (4xx): no money left, so allow a retry. On 5xx/network the outcome is unknown: keep the claim.
        if (e instanceof PayPalError && e.status >= 400 && e.status < 500) await releaseSettlementClaim(escrowId);
        throw e;
      }
      const batchId = payoutResult.batch_header?.payout_batch_id as string | undefined;
      if (!batchId) return NextResponse.json({ error: "Payout batch ID not found in PayPal response" }, { status: 502 });
      const updated = await releaseEscrow(escrowId, batchId, payoutResult.items?.[0]?.payout_item_id as string | undefined, payoutResult.batch_header?.batch_status as string | undefined);
      await notifyReceipt(updated, "payout");
      return NextResponse.json(updated);
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    if (error instanceof EscrowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "BUSY" ? 409 : 400 });
    console.error("escrow_release_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to release escrow" }, { status: error instanceof PayPalError ? 502 : 500 });
  }
}

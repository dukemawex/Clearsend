import { NextRequest, NextResponse } from "next/server";
import { addSharedEscrow, getEscrow, setPayoutStatus } from "@/lib/escrow";
import { ownerFromRequest } from "@/lib/owner";
import { getPayoutStatus } from "@/lib/paypal";

const TERMINAL = new Set(["SUCCESS", "FAILED", "RETURNED", "REFUNDED", "REVERSED", "BLOCKED", "DENIED"]);
const PAYOUT_NOTES: Record<string, string> = {
  UNCLAIMED: "The recipient has no PayPal account for this email/phone yet. PayPal emailed/texted them to claim it; if unclaimed within 30 days PayPal returns the funds to the sender (ClearSend sandbox merchant).",
  PENDING: "PayPal is processing the payout.",
  ONHOLD: "PayPal put the payout on hold for review.",
  RETURNED: "The payout was not claimed in 30 days and PayPal returned the funds to the sender.",
  FAILED: "PayPal could not deliver the payout. Check the recipient identifier and country.",
  BLOCKED: "PayPal blocked this payout (compliance or unsupported recipient).",
  SUCCESS: "Paid into the recipient's PayPal account. They can withdraw to their local bank from PayPal.",
};
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Check for service key
    const serviceKey = request.headers.get("x-clearsend-api-key");
    const hasValidServiceKey = serviceKey && serviceKey === process.env.CLEAR_SEND_API_KEY;
    
    if (!hasValidServiceKey) {
      // Require role + token
      const { searchParams } = new URL(request.url);
      const role = searchParams.get("role") as EscrowRole | null;
      const token = searchParams.get("token");
      
      if (!role || !token) {
        return NextResponse.json({ error: "Missing role or token" }, { status: 401 });
      }
      
      if (!verifyEscrowToken(id, role, token)) {
        return NextResponse.json({ error: "Invalid token for this role" }, { status: 403 });
      }
    }

    const escrow = await getEscrow(id);
    
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    
    // A visitor who opened a valid role link gets this one escrow in their own "shared with me" list.
    const owner = ownerFromRequest(request);
    if (!hasValidServiceKey && owner && escrow.ownerId !== owner) await addSharedEscrow(owner, escrow.id, (new URL(request.url).searchParams.get("role") ?? "payer") as EscrowRole).catch(() => {});
    let out = escrow;
    if (escrow.state === "released" && escrow.payoutBatchId && !TERMINAL.has(escrow.payoutStatus ?? "")) {
      try {
        const b = await getPayoutStatus(escrow.payoutBatchId);
        const st = (b.items?.[0]?.transaction_status ?? b.batch_header?.batch_status) as string | undefined;
        if (st && st !== escrow.payoutStatus) out = await setPayoutStatus(escrow.id, st);
      } catch (e) { console.warn("payout_status_refresh_failed", e instanceof Error ? e.message : e); }
    }
    return NextResponse.json({ ...out, payoutNote: out.payoutStatus ? PAYOUT_NOTES[out.payoutStatus] : undefined });
  } catch (error) {
    console.error("escrow_get_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to get escrow" }, { status: 500 });
  }
}

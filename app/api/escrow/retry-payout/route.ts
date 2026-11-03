import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notifyReceipt } from "@/lib/chatbots/notify";
import { EscrowError, getEscrow } from "@/lib/escrow";
import { authorizeEscrow, confirmationMatches, requiredConfirmation } from "@/lib/escrow-auth";
import { PayPalError } from "@/lib/paypal";
import { retryPayout } from "@/lib/payout-retry";

export const runtime = "nodejs";

const Schema = z.object({
  escrowId: z.string(),
  role: z.string().optional(),
  token: z.string().optional(),
  /** Same phrase as release: "RELEASE <amount> <CUR>". */
  confirmation: z.string().max(64).optional(),
  recipientType: z.enum(["EMAIL", "PHONE", "PAYPAL_ID"]).optional(),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().max(32).optional(),
  recipientPayerId: z.string().max(32).optional(),
  recipientCountry: z.string().min(2).max(2).optional(),
});

/** Payer-only: re-send a payout after PayPal confirmed the previous batch failed, optionally to a corrected recipient. */
export async function POST(request: NextRequest) {
  try {
    const { escrowId, role, token, confirmation, ...fix } = Schema.parse(await request.json());
    const escrow = await getEscrow(escrowId);
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    const auth = authorizeEscrow(request, escrow, "release", { role, token });
    if (!auth.ok) return auth.res;
    const want = requiredConfirmation("release", escrow.amount, escrow.currency);
    if (!confirmationMatches(confirmation, want)) return NextResponse.json({ error: `Confirmation required: send confirmation "${want}" exactly`, confirmationRequired: want }, { status: 400 });
    const updated = await retryPayout(escrowId, fix);
    await notifyReceipt(updated, "payout").catch(() => undefined);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    if (error instanceof EscrowError) return NextResponse.json({ error: error.message, code: error.code }, { status: ["BUSY", "INVALID_STATE", "PAYOUT_NOT_FAILED", "ALREADY_RETRIED"].includes(error.code) ? 409 : error.code === "NOT_FOUND" ? 404 : 400 });
    console.error("escrow_retry_payout_error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to retry payout" }, { status: error instanceof PayPalError ? 502 : 500 });
  }
}

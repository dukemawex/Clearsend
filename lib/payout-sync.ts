import { getEscrow, reconcilePayoutStatus, type EscrowRecord } from "./escrow";
import { getPayoutStatus } from "./paypal";
import { payoutOutcome } from "./payout-failure";

const TERMINAL = new Set(["SUCCESS", "FAILED", "RETURNED", "REFUNDED", "REVERSED", "BLOCKED", "DENIED", "CANCELED"]);

/** Poll PayPal for the current payout batch and record the outcome (incl. failures + error code). Never throws. */
export async function refreshPayout(e: EscrowRecord, fetchStatus: typeof getPayoutStatus = getPayoutStatus): Promise<EscrowRecord> {
  if (e.state !== "released" || !e.payoutBatchId || e.payoutFailure || TERMINAL.has(e.payoutStatus ?? "")) return e;
  try {
    const o = payoutOutcome(await fetchStatus(e.payoutBatchId));
    if (o.status && (o.status !== e.payoutStatus || o.code)) return await reconcilePayoutStatus(e.id, o.status, undefined, o.code, e.payoutBatchId);
  } catch (err) { console.warn("payout_status_refresh_failed", err instanceof Error ? err.message : err); }
  return e;
}

export async function refreshPayoutById(id: string): Promise<EscrowRecord | null> {
  const e = await getEscrow(id);
  return e ? refreshPayout(e) : null;
}

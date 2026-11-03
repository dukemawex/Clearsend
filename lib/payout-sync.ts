import { getEscrow, reconcilePayoutStatus, type EscrowRecord } from "./escrow";
import { getPayoutItem, getPayoutStatus } from "./paypal";
import { isPayoutFailed, payoutOutcome } from "./payout-failure";

const TERMINAL = new Set(["SUCCESS", "FAILED", "RETURNED", "REFUNDED", "REVERSED", "BLOCKED", "DENIED", "CANCELED"]);

export type ErrorLookupDeps = { fetchBatch: typeof getPayoutStatus; fetchItem: typeof getPayoutItem };
const liveLookup: ErrorLookupDeps = { fetchBatch: getPayoutStatus, fetchItem: getPayoutItem };

/** Reads PayPal's error code for a failed payout: batch GET first, then the payout item GET (which carries `errors`). Never throws. */
export async function lookupPayoutError(batchId?: string, itemId?: string, deps: ErrorLookupDeps = liveLookup): Promise<{ code?: string; message?: string; itemId?: string }> {
  let id = itemId;
  if (batchId) {
    try {
      const b = await deps.fetchBatch(batchId);
      const o = payoutOutcome(b);
      id ||= (b as { items?: Array<{ payout_item_id?: string }> })?.items?.[0]?.payout_item_id;
      if (o.code) return { code: o.code, message: o.message, itemId: id };
    } catch (err) { console.warn("payout_error_lookup_batch_failed", err instanceof Error ? err.message.slice(0, 120) : err); }
  }
  if (id) {
    try { const o = payoutOutcome(await deps.fetchItem(id)); if (o.code) return { code: o.code, message: o.message, itemId: id }; }
    catch (err) { console.warn("payout_error_lookup_item_failed", err instanceof Error ? err.message.slice(0, 120) : err); }
  }
  return { itemId: id };
}

/** Poll PayPal for the current payout batch and record the outcome (incl. failures + error code). Never throws. */
export async function refreshPayout(e: EscrowRecord, fetchStatus: typeof getPayoutStatus = getPayoutStatus, fetchItem: typeof getPayoutItem = getPayoutItem): Promise<EscrowRecord> {
  if (e.state !== "released" || !e.payoutBatchId) return e;
  const missingCode = !!e.payoutFailure && !e.payoutFailure.code && e.payoutFailure.batchId === e.payoutBatchId;
  if (!missingCode && (e.payoutFailure || TERMINAL.has(e.payoutStatus ?? ""))) return e;
  try {
    const raw = await fetchStatus(e.payoutBatchId);
    const o = payoutOutcome(raw);
    let code = o.code;
    if (isPayoutFailed(o.status) && !code) code = (await lookupPayoutError(undefined, (raw as { items?: Array<{ payout_item_id?: string }> })?.items?.[0]?.payout_item_id ?? e.payoutItemId, { fetchBatch: fetchStatus, fetchItem })).code;
    if (o.status && (o.status !== e.payoutStatus || code)) return await reconcilePayoutStatus(e.id, o.status, undefined, code, e.payoutBatchId);
  } catch (err) { console.warn("payout_status_refresh_failed", err instanceof Error ? err.message : err); }
  return e;
}

export async function refreshPayoutById(id: string): Promise<EscrowRecord | null> {
  const e = await getEscrow(id);
  return e ? refreshPayout(e) : null;
}

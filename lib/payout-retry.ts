import { claimPayoutRetry, correctPayoutRecipient, EscrowError, getEscrow, payoutReceiver, reconcilePayoutStatus, recordPayoutRetry, releasePayoutRetryClaim, withEscrowLock, type EscrowRecord } from "./escrow";
import { createPayout, getPayoutStatus, PayPalError } from "./paypal";
import { isPayoutFailed, payoutOutcome } from "./payout-failure";
import type { RecipientType } from "./payout-countries";

export type RecipientFix = { recipientEmail?: string; recipientPhone?: string; recipientPayerId?: string; recipientType?: RecipientType; recipientCountry?: string };
export type RetryDeps = { fetchStatus: typeof getPayoutStatus; pay: typeof createPayout };
const live: RetryDeps = { fetchStatus: getPayoutStatus, pay: createPayout };

/**
 * Re-send a payout only after PayPal's own API confirms the current batch FAILED/DENIED/RETURNED/... (never trusts stored state alone).
 * Safe by construction: per-escrow lock, the permanent release claim from PR #15 stays (so a refund is still impossible),
 * and a permanent one-retry-per-failed-batch claim stops two retries of the same failure from both paying.
 */
export async function retryPayout(id: string, fix: RecipientFix, deps: RetryDeps = live): Promise<EscrowRecord> {
  return withEscrowLock(id, async () => {
    const e = await getEscrow(id);
    if (!e) throw new EscrowError("Escrow not found", "NOT_FOUND");
    if (e.state !== "released" || !e.payoutBatchId) throw new EscrowError(`Escrow is ${e.state}; only a released escrow with a failed payout can be retried`, "INVALID_STATE");
    const failedBatch = e.payoutBatchId;
    const o = payoutOutcome(await deps.fetchStatus(failedBatch));
    if (!isPayoutFailed(o.status)) throw new EscrowError(`PayPal shows payout batch ${failedBatch} as ${o.status ?? "unknown"}, not failed. Retry is only allowed after PayPal confirms the payout failed.`, "PAYOUT_NOT_FAILED");
    await reconcilePayoutStatus(id, o.status!, undefined, o.code, failedBatch);
    if (!(await claimPayoutRetry(id, failedBatch))) throw new EscrowError(`Payout batch ${failedBatch} was already retried`, "ALREADY_RETRIED");
    let fixed: EscrowRecord;
    try { fixed = await correctPayoutRecipient(id, fix); } catch (err) { await releasePayoutRetryClaim(id, failedBatch); throw err; }
    const rcv = payoutReceiver(fixed);
    if (!rcv) { await releasePayoutRetryClaim(id, failedBatch); throw new EscrowError("No recipient PayPal email, phone or PayPal ID configured", "INVALID_RECIPIENT"); }
    let res;
    try {
      res = await deps.pay({ ...rcv, amount: fixed.amount, currency: fixed.currency, note: `ClearSend Escrow Release (retry): ${fixed.specification.slice(0, 90)}`, senderItemId: fixed.id });
    } catch (err) {
      // 4xx: PayPal refused before any money moved, so the same failed batch may be retried again. 5xx/network: unknown, keep the claim.
      if (err instanceof PayPalError && err.status >= 400 && err.status < 500) await releasePayoutRetryClaim(id, failedBatch);
      throw err;
    }
    const batchId = res.batch_header?.payout_batch_id as string | undefined;
    if (!batchId) throw new PayPalError("Payout batch ID not found in PayPal response", 502);
    return recordPayoutRetry(id, batchId, res.items?.[0]?.payout_item_id as string | undefined, res.batch_header?.batch_status as string | undefined);
  });
}

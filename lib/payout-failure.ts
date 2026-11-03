/* eslint-disable @typescript-eslint/no-explicit-any -- PayPal payout JSON is loosely typed; read defensively. */
// Pure helpers: classify PayPal payout outcomes and explain PayPal error codes in plain English.

/** PayPal statuses that mean the money did NOT reach the recipient and is back with (or never left) the sender. Retry allowed. */
export const PAYOUT_FAILED_STATUSES = new Set(["FAILED", "DENIED", "RETURNED", "BLOCKED", "REFUNDED", "CANCELED", "REVERSED"]);
/** Not delivered yet and needs attention, but PayPal may still complete it. Never retryable (could double-pay). */
export const PAYOUT_ATTENTION_STATUSES = new Set(["HELD", "ONHOLD", "UNCLAIMED"]);

export function isPayoutFailed(status?: string | null): boolean { return !!status && PAYOUT_FAILED_STATUSES.has(status.toUpperCase()); }

const CODE_TEXT: Record<string, string> = {
  RECEIVER_COUNTRY_NOT_ALLOWED: "PayPal can't send payouts to the recipient's PayPal account country.",
  RECEIVER_UNREGISTERED: "The recipient email or phone isn't linked to a PayPal account that can receive this payout.",
  RECEIVER_UNCONFIRMED: "The recipient's PayPal account isn't confirmed yet.",
  RECEIVER_ACCOUNT_LOCKED: "The recipient's PayPal account is locked or restricted.",
  RECEIVER_ACCOUNT_LIMITATION: "The recipient's PayPal account has a limitation and can't receive money.",
  RECEIVER_YOUTH_ACCOUNT: "The recipient's PayPal account is a youth account that can't receive payouts.",
  RECEIVING_LIMIT_EXCEEDED: "The recipient's PayPal account has hit its receiving limit.",
  CURRENCY_NOT_SUPPORTED_FOR_RECEIVER: "The recipient's PayPal account can't receive this currency.",
  CURRENCY_COMPLIANCE: "PayPal's currency rules block this payout for the recipient.",
  REGULATORY_BLOCKED: "PayPal blocked the payout for regulatory reasons.",
  REGULATORY_PENDING: "PayPal is holding the payout for a regulatory review.",
  RISK_DECLINE: "PayPal's risk checks declined the payout.",
  RECEIVER_REFUSED: "The recipient refused the payout.",
  PENDING_RECIPIENT_NON_HOLDING_CURRENCY_PAYMENT_PREFERENCE: "The recipient must accept this currency in their PayPal settings.",
  INSUFFICIENT_FUNDS: "The ClearSend sandbox merchant didn't have enough PayPal balance for the payout.",
  ACCOUNT_RESTRICTED: "The ClearSend sender account is restricted for payouts.",
  NON_HOLDING_CURRENCY: "The recipient doesn't hold this currency in PayPal.",
  DUPLICATE_ITEM: "PayPal flagged this as a duplicate payout.",
  ZERO_AMOUNT: "The payout amount was zero.",
};
const STATUS_TEXT: Record<string, string> = {
  FAILED: "PayPal could not deliver the payout.",
  DENIED: "PayPal denied the payout batch.",
  RETURNED: "The payout was not claimed in time and PayPal returned the funds to the sender.",
  BLOCKED: "PayPal blocked this payout.",
  REFUNDED: "The payout was refunded back to the sender.",
  CANCELED: "The payout was cancelled before the recipient claimed it.",
  REVERSED: "PayPal reversed the payout.",
};

export function explainPayoutError(code?: string | null, status?: string | null): string {
  if (code && CODE_TEXT[code]) return CODE_TEXT[code];
  if (code) return `PayPal returned ${code}.`;
  return STATUS_TEXT[(status ?? "").toUpperCase()] ?? "PayPal could not deliver the payout.";
}

export const PAYOUT_RETRY_GUIDANCE = "No money reached the recipient; PayPal returned it to the ClearSend sandbox balance. The payer can correct the recipient's PayPal email/phone or country and retry the payout from the escrow page (typed confirmation required). The escrow can't be refunded or paid twice.";

/** Status + PayPal error code from a payouts batch GET, a payout item, or a webhook resource. */
export function payoutOutcome(src: any): { status?: string; code?: string; message?: string } {
  if (!src || typeof src !== "object") return {};
  const item = src.items?.[0] ?? (src.transaction_status || src.payout_item_id ? src : undefined);
  const batchStatus: string | undefined = src.batch_header?.batch_status;
  const itemStatus: string | undefined = item?.transaction_status;
  const err = item?.errors ?? src.errors;
  const e0 = Array.isArray(err) ? err[0] : err;
  const code: string | undefined = e0?.name ?? e0?.issue ?? (Array.isArray(e0?.details) ? e0.details[0]?.issue : undefined);
  // A DENIED batch wins over a still-PENDING item; otherwise prefer the item, which carries the real outcome.
  const status = batchStatus === "DENIED" ? (isPayoutFailed(itemStatus) ? itemStatus : "DENIED") : itemStatus ?? batchStatus;
  return { status: status?.toUpperCase(), code: code || undefined, message: e0?.message };
}

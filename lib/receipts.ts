// Payment receipts built only from real stored PayPal sandbox events (capture, payout, refund).
import { z } from "zod";
import { getMidMarketRate } from "./fx";

export const FEE_PERCENT = 2.5;
export const FX_SPREAD_PERCENT = 1.2;

/** ClearSend's FX spread applies only to real conversions; same-currency payouts have none. */
export function spreadPercentFor(from: string, to: string): number {
  return from.trim().toUpperCase() === to.trim().toUpperCase() ? 0 : FX_SPREAD_PERCENT;
}
/** Fee model: the payer is charged exactly the escrow amount; ClearSend's 2.5% fee is withheld from the payout.
 * The recipient is paid amount - fee (same currency), and a refund returns the full captured amount (no fee kept). */
export function escrowFee(amount: number) { return r2(amount * FEE_PERCENT / 100); }
export function escrowPayoutAmount(amount: number) { return r2(amount - escrowFee(amount)); }
export const SANDBOX_LABEL = "PayPal Sandbox - test payment, no real money";

export const ReceiptKind = z.enum(["funding", "payout", "refund"]);
export type ReceiptKind = z.infer<typeof ReceiptKind>;

export const Receipt = z.object({
  id: z.string(),
  number: z.string(),
  kind: ReceiptKind,
  subjectType: z.enum(["escrow", "trip"]),
  subjectId: z.string(),
  issuedAt: z.number(),
  payer: z.string(),
  payerEmail: z.string().optional(),
  recipient: z.string(),
  recipientEmail: z.string().optional(),
  recipientCountry: z.string().optional(),
  description: z.string().optional(),
  amount: z.number(),
  currency: z.string(),
  feePercent: z.number(),
  fee: z.number(),
  /** Money that actually moved in this PayPal event: charged (funding), sent to recipient (payout), returned to payer (refund). */
  settledAmount: z.number().optional(),
  fx: z.object({
    destinationCurrency: z.string(),
    midMarketRate: z.number(),
    spreadPercent: z.number(),
    customerRate: z.number(),
    destinationAmount: z.number(),
    source: z.string(),
  }).optional(),
  paypal: z.object({
    orderId: z.string().optional(),
    captureId: z.string().optional(),
    payoutBatchId: z.string().optional(),
    payoutItemId: z.string().optional(),
    refundId: z.string().optional(),
  }),
  status: z.string(),
  environment: z.string(),
});
export type Receipt = z.infer<typeof Receipt>;

const COUNTRY_CURRENCY: Record<string, string> = {
  NG: "NGN", NIGERIA: "NGN", GH: "GHS", GHANA: "GHS", KE: "KES", KENYA: "KES", ZA: "ZAR", "SOUTH AFRICA": "ZAR",
  GB: "GBP", UK: "GBP", "UNITED KINGDOM": "GBP", US: "USD", USA: "USD", "UNITED STATES": "USD", CA: "CAD", CANADA: "CAD",
  IN: "INR", INDIA: "INR", PH: "PHP", PHILIPPINES: "PHP", MX: "MXN", MEXICO: "MXN", EG: "EGP", EGYPT: "EGP",
  UG: "UGX", UGANDA: "UGX", TZ: "TZS", TANZANIA: "TZS", RW: "RWF", RWANDA: "RWF", MA: "MAD", MOROCCO: "MAD",
  SN: "XOF", SENEGAL: "XOF", CI: "XOF", CM: "XAF", CAMEROON: "XAF", AE: "AED", UAE: "AED", AU: "AUD", AUSTRALIA: "AUD",
  JP: "JPY", JAPAN: "JPY", CN: "CNY", CHINA: "CNY", BR: "BRL", BRAZIL: "BRL", CH: "CHF", SWITZERLAND: "CHF",
  DE: "EUR", GERMANY: "EUR", FR: "EUR", FRANCE: "EUR", ES: "EUR", SPAIN: "EUR", IT: "EUR", ITALY: "EUR", NL: "EUR", IE: "EUR", PT: "EUR", BE: "EUR",
};
export function currencyForCountry(country?: string): string | undefined {
  if (!country) return undefined;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function receiptId(kind: ReceiptKind, subjectId: string) { return `rcpt_${kind}_${subjectId}`; }
export function parseReceiptId(id: string): { kind: ReceiptKind; subjectType: "escrow" | "trip"; subjectId: string } | null {
  const m = /^rcpt_(funding|payout|refund)_((escrow|trip)_[A-Za-z0-9_]+)$/.exec(id);
  return m ? { kind: m[1] as ReceiptKind, subjectId: m[2], subjectType: m[3] as "escrow" | "trip" } : null;
}

export type BuildInput = {
  kind: ReceiptKind;
  subjectType: "escrow" | "trip";
  subjectId: string;
  issuedAt: number;
  payer: string; payerEmail?: string;
  recipient: string; recipientEmail?: string; recipientCountry?: string;
  description?: string;
  amount: number; currency: string;
  fx?: { destinationCurrency: string; midMarketRate: number; source: string } | null;
  paypal: Receipt["paypal"];
  status: string;
  /** Real fee when the product uses a different one (trips: 3% service fee stored on the trip). */
  feeOverride?: { percent: number; amount: number };
};

/** Pure: builds a receipt from values that were already stored or returned by PayPal. */
export function buildReceipt(i: BuildInput): Receipt {
  const feePercent = i.feeOverride?.percent ?? FEE_PERCENT;
  const isEscrowRefund = i.subjectType === "escrow" && i.kind === "refund";
  const fee = isEscrowRefund ? 0 : r2(i.feeOverride?.amount ?? i.amount * FEE_PERCENT / 100);
  const settledAmount = i.subjectType === "escrow" && i.kind === "payout" ? r2(i.amount - fee) : i.amount;
  const fx = i.fx ? (() => {
    const same = spreadPercentFor(i.currency, i.fx.destinationCurrency) === 0;
    const spreadPercent = same ? 0 : FX_SPREAD_PERCENT;
    const midMarketRate = same ? 1 : i.fx.midMarketRate;
    const customerRate = midMarketRate * (1 - spreadPercent / 100);
    return { destinationCurrency: i.fx.destinationCurrency, midMarketRate, spreadPercent, customerRate, destinationAmount: r2((i.kind === "funding" && i.subjectType === "escrow" ? i.amount - fee : settledAmount) * customerRate), source: i.fx.source };
  })() : undefined;
  const d = new Date(i.issuedAt);
  const number = `CS-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${i.kind.slice(0, 3).toUpperCase()}-${i.subjectId.slice(-6).toUpperCase()}`;
  const paypal = Object.fromEntries(Object.entries(i.paypal).filter(([, v]) => v)) as Receipt["paypal"];
  return Receipt.parse({
    id: receiptId(i.kind, i.subjectId), number, kind: i.kind, subjectType: i.subjectType, subjectId: i.subjectId, issuedAt: i.issuedAt,
    payer: i.payer, payerEmail: i.payerEmail, recipient: i.recipient, recipientEmail: i.recipientEmail, recipientCountry: i.recipientCountry,
    description: i.description?.slice(0, 200), amount: i.amount, currency: i.currency, feePercent: isEscrowRefund ? 0 : feePercent, fee, settledAmount, fx, paypal, status: i.status, environment: SANDBOX_LABEL,
  });
}

/** Live FX at event time (real rate provider); undefined when the destination currency is unknown or the provider fails. */
export async function fxAtEvent(from: string, country?: string, receiveCurrency?: string): Promise<BuildInput["fx"]> {
  const to = receiveCurrency ?? currencyForCountry(country);
  if (!to) return null;
  try { const { rate, source } = await getMidMarketRate(from, to); return { destinationCurrency: to, midMarketRate: rate, source }; }
  catch { return null; }
}

export function formatUtc(ms: number) { return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC"; }
export function formatLagos(ms: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(ms)) + " WAT (Lagos)";
}
export const SETTLED_LABEL: Record<ReceiptKind, string> = { funding: "Charged to payer", payout: "Sent to recipient", refund: "Refunded to payer" };
export const KIND_TITLE: Record<ReceiptKind, string> = { funding: "Escrow funding receipt", payout: "Payout receipt", refund: "Refund receipt" };
export const money = (n: number, c: string) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

/** Plain-text summary for chat. Contains no tokens. */
export function receiptText(r: Receipt): string {
  const title = r.subjectType === "trip" && r.kind === "funding" ? "Trip payment receipt" : KIND_TITLE[r.kind];
  const ids = [r.paypal.orderId && `PayPal order: ${r.paypal.orderId}`, r.paypal.captureId && `Capture: ${r.paypal.captureId}`, r.paypal.payoutBatchId && `Payout batch: ${r.paypal.payoutBatchId}`, r.paypal.refundId && `Refund: ${r.paypal.refundId}`].filter(Boolean);
  return [
    `🧾 ${title} ${r.number}`,
    `${r.subjectType === "trip" ? "Trip" : "Escrow"}: ${r.subjectId}`,
    `Date: ${formatUtc(r.issuedAt)} / ${formatLagos(r.issuedAt)}`,
    `Payer: ${r.payer}  →  Recipient: ${r.recipient}${r.recipientCountry ? ` (${r.recipientCountry})` : ""}`,
    `Amount: ${money(r.amount, r.currency)}`,
    `Fee (${r.feePercent}%): ${money(r.fee, r.currency)}${r.kind === "payout" && r.subjectType === "escrow" ? " (withheld from payout)" : r.kind === "refund" && r.subjectType === "escrow" ? " (not kept on refunds)" : ""}`,
    r.settledAmount !== undefined ? `${SETTLED_LABEL[r.kind]}: ${money(r.settledAmount, r.currency)}` : "",
    r.fx ? `FX: 1 ${r.currency} = ${r.fx.midMarketRate.toFixed(4)} ${r.fx.destinationCurrency} mid-market, ${r.fx.customerRate.toFixed(4)} after ${r.fx.spreadPercent}% spread → ${money(r.fx.destinationAmount, r.fx.destinationCurrency)} (quote at event time)` : "",
    r.kind === "payout" ? `Paid in ${r.currency} to the recipient's PayPal account${r.recipientCountry ? ` (${r.recipientCountry})` : ""}; they withdraw to a local bank from PayPal. Unclaimed payouts return to the sender after 30 days.` : "",
    ...ids,
    `Status: ${r.status}`,
    r.environment,
  ].filter(Boolean).join("\n");
}

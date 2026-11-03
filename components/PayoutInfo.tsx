"use client";
import { useEffect, useState } from "react";
import type { EscrowRecord } from "@/lib/escrow";
import { PAYOUT_COUNTRIES } from "@/lib/payout-countries";

type Q = { midRate: number; effectiveRate: number; source: string; fee: number; totalCharged: number; received: number; to: string };

/** Shown to payer, recipient and verifier: where the money goes, in what currency, and the live FX quote. */
export function PayoutInfo({ escrow }: { escrow: EscrowRecord & { payoutNote?: string } }) {
  const to = escrow.receiveCurrency;
  const [q, setQ] = useState<Q | null>(null);
  useEffect(() => { if (!to || to === escrow.currency) return; fetch(`/api/fx/quote?amount=${escrow.amount}&from=${escrow.currency}&to=${to}`).then((r) => r.ok ? r.json() : null).then(setQ).catch(() => {}); }, [escrow.amount, escrow.currency, to]);
  const id = escrow.recipientType === "PHONE" ? escrow.recipientPhone : escrow.recipientType === "PAYPAL_ID" ? escrow.recipientPayerId : escrow.recipientEmail;
  return (
    <div className="mb-6 rounded-xl border border-blue-100 bg-white p-4 text-sm" data-testid="payout-info">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Cross-border payout (PayPal Payouts, sandbox)</p>
      <p className="mt-1">To <b>{escrow.recipient}</b> in <b>{PAYOUT_COUNTRIES[escrow.recipientCountry] ?? escrow.recipientCountry}</b> via PayPal {escrow.recipientType === "PHONE" ? "phone" : escrow.recipientType === "PAYPAL_ID" ? "ID" : "email"} {id ? <code>{id}</code> : null}. Paid in <b>{escrow.amount.toFixed(2)} {escrow.currency}</b>.</p>
      {q && <p className="mt-1">Indicative: fee {q.fee.toFixed(2)} {escrow.currency} (2.5%), rate {q.effectiveRate.toFixed(4)} after 1.2% spread ({q.source}) ≈ <b>{q.received.toFixed(2)} {q.to}</b>.</p>}
      <p className="mt-1 text-xs text-gray-600">Funds land in the recipient&apos;s PayPal account (PayPal converts with its own rate); they withdraw to their local bank from PayPal. No direct bank payout. Unclaimed payouts return to the sender after 30 days.</p>
      {escrow.payoutStatus && <p className="mt-2"><b>Payout status:</b> {escrow.payoutStatus}{escrow.payoutNote ? ` - ${escrow.payoutNote}` : ""}</p>}
    </div>
  );
}

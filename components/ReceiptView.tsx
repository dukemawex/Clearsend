import { ClearSendLogo } from "@/components/clearsend-logo";
import { KIND_TITLE, SETTLED_LABEL, formatLagos, formatUtc, money, type Receipt } from "@/lib/receipts";

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return <div className="flex items-start justify-between gap-6 border-b border-line py-2.5 text-sm last:border-0"><dt className="text-mut">{k}</dt><dd className={`text-right ${strong ? "font-extrabold" : "font-semibold"} break-all`}>{v}</dd></div>;
}

export function ReceiptView({ r }: { r: Receipt }) {
  const title = r.subjectType === "trip" && r.kind === "funding" ? "Trip payment receipt" : KIND_TITLE[r.kind];
  return (
    <article className="cs-card receipt-sheet mx-auto max-w-2xl p-6 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <ClearSendLogo />
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] c-acc">{title}</div>
          <div className="mt-1 font-mono text-lg font-bold">{r.number}</div>
          <div className="mt-1 text-xs text-mut">Status: <b>{r.status}</b></div>
        </div>
      </header>
      <div className="my-5 rounded-xl px-4 py-2 text-center text-xs font-bold c-warn bg-warn">{r.environment}</div>
      <div className="mb-6 text-center">
        <div className="text-xs uppercase tracking-wider text-mut">{r.kind === "refund" ? "Refunded" : r.kind === "payout" ? "Paid out" : "Paid"}</div>
        <div className="text-4xl font-extrabold" style={{ color: "var(--navy)" }}>{money(r.amount, r.currency)}</div>
      </div>
      <dl>
        <Row k={r.subjectType === "trip" ? "Trip" : "Escrow"} v={<span className="font-mono">{r.subjectId}</span>} />
        <Row k="Date (UTC)" v={formatUtc(r.issuedAt)} />
        <Row k="Date (Lagos)" v={formatLagos(r.issuedAt)} />
        <Row k="Payer" v={<>{r.payer}{r.payerEmail ? <span className="block text-xs text-mut">{r.payerEmail}</span> : null}</>} />
        <Row k="Recipient" v={<>{r.recipient}{r.recipientCountry ? ` (${r.recipientCountry})` : ""}{r.recipientEmail ? <span className="block text-xs text-mut">{r.recipientEmail}</span> : null}</>} />
        {r.description && <Row k="For" v={r.description} />}
        <Row k="Amount" v={money(r.amount, r.currency)} strong />
        <Row k={`ClearSend fee (${r.feePercent}%)`} v={money(r.fee, r.currency)} />
        {r.settledAmount !== undefined && <Row k={SETTLED_LABEL[r.kind]} v={money(r.settledAmount, r.currency)} strong />}
        {r.fx ? <>
          <Row k="Mid-market rate" v={`1 ${r.currency} = ${r.fx.midMarketRate.toFixed(4)} ${r.fx.destinationCurrency}`} />
          <Row k={`FX spread (${r.fx.spreadPercent}%)`} v={`Customer rate ${r.fx.customerRate.toFixed(4)}`} />
          <Row k="Destination amount (quote)" v={money(r.fx.destinationAmount, r.fx.destinationCurrency)} strong />
        </> : <Row k="FX" v={r.kind === "refund" ? "Not applicable (refund in original currency)" : "Not applicable"} />}
        {r.paypal.orderId && <Row k="PayPal order ID" v={<span className="font-mono">{r.paypal.orderId}</span>} />}
        {r.paypal.captureId && <Row k="PayPal capture ID" v={<span className="font-mono">{r.paypal.captureId}</span>} />}
        {r.paypal.payoutBatchId && <Row k="PayPal payout batch ID" v={<span className="font-mono">{r.paypal.payoutBatchId}</span>} />}
        {r.paypal.payoutItemId && <Row k="PayPal payout item ID" v={<span className="font-mono">{r.paypal.payoutItemId}</span>} />}
        {r.paypal.refundId && <Row k="PayPal refund ID" v={<span className="font-mono">{r.paypal.refundId}</span>} />}
      </dl>
      <footer className="mt-6 border-t border-line pt-4 text-xs text-mut">
        {r.kind === "payout" ? <p>Paid in {r.currency} to the recipient&apos;s PayPal account{r.recipientCountry ? ` (${r.recipientCountry})` : ""}. They withdraw to their local bank from PayPal; PayPal applies its own conversion. Unclaimed payouts are returned to the sender after 30 days.</p> : null}
        {r.fx ? <p>FX figures are a live quote ({r.fx.source}) taken when this event happened; the PayPal transaction itself is in {r.currency}. </p> : null}
        <p>Issued by ClearSend from PayPal sandbox responses stored at event time. Receipt ID {r.id}.</p>
      </footer>
    </article>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Stepper } from "@/components/room/Stepper";
import { useToast } from "@/components/room/Toaster";
import { Card, ErrorBox, Eyebrow, Money, PageHeader, Row, SandboxNote, Skeleton } from "@/components/room/ui";
import { saveLinks } from "@/lib/creds";
import { SpecReview } from "@/components/SpecReview";
import type { StructuredSpec } from "@/lib/spec";
import type { ExtractedDocument } from "@/lib/documents";
import { PAYOUT_COUNTRIES, PAYOUT_CURRENCIES, checkPayoutEligibility, type RecipientType } from "@/lib/payout-countries";

type Quote = { midRate: number; effectiveRate: number; spreadPct: number; source: string; fee: number; totalCharged: number; received: number; to: string; at: string };
const ROLE_TEXT: Record<string, string> = { payer: "Funds with PayPal and types the amount to release.", recipient: "Submits the deliverable and gets the PayPal Payout.", verifier: "Reviews the AI verdict." };

export default function NewEscrow() {
  const toast = useToast();
  const [f, setF] = useState({ payer: "", payerEmail: "", recipient: "", recipientEmail: "", recipientType: "EMAIL" as RecipientType, recipientCountry: "KE", amount: "50", currency: "USD", receiveCurrency: "KES", specification: "", criteria: "" });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; links: Record<string, string> } | null>(null);
  const [spec, setSpec] = useState<StructuredSpec | null>(null);
  const [specDoc, setSpecDoc] = useState<ExtractedDocument | null>(null);
  const [specModel, setSpecModel] = useState<string | undefined>();
  const [specBusy, setSpecBusy] = useState(false);
  const [specErr, setSpecErr] = useState<string | null>(null);
  const [specOk, setSpecOk] = useState(false);

  function applySpec(sp: StructuredSpec, doc: ExtractedDocument | null, model?: string) {
    setSpec(sp); setSpecDoc(doc); setSpecModel(model); setSpecOk(false);
    setF((cur) => ({
      ...cur,
      specification: [sp.title, sp.summary, sp.deliverables.length ? "Deliverables:\n" + sp.deliverables.map((d) => "- " + d).join("\n") : "", sp.deadline ? "Deadline: " + sp.deadline : ""].filter(Boolean).join("\n") || cur.specification,
      criteria: sp.acceptanceCriteria.join("\n") || cur.criteria,
      amount: sp.amount ? String(sp.amount) : cur.amount,
      currency: sp.currency ?? cur.currency,
      recipient: cur.recipient || sp.recipientName || "",
    }));
  }
  useEffect(() => {
    try { const raw = sessionStorage.getItem("clearsend.specDraft"); if (raw) { sessionStorage.removeItem("clearsend.specDraft"); const d = JSON.parse(raw); if (d?.spec) applySpec(d.spec, d.document ?? null, d.model); } } catch { /* ignore */ }
  }, []);

  async function uploadSpec(file: File) {
    if (file.size > 4.5 * 1024 * 1024) { setSpecErr("Files over 4.5 MB exceed the upload limit."); return; }
    setSpecBusy(true); setSpecErr(null);
    try {
      const form = new FormData(); form.append("file", file);
      const r = await fetch("/api/spec/extract", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok || !j.spec) throw new Error(j.error ?? `HTTP ${r.status}`);
      applySpec(j.spec, j.document, j.model);
      toast({ tone: "ok", title: "Spec extracted", body: "Review it, then confirm before creating the escrow." });
    } catch (e) { setSpecErr((e as Error).message); } finally { setSpecBusy(false); }
  }

  function editSpec(sp: StructuredSpec) {
    setSpec(sp); setSpecOk(false);
    setF((cur) => ({ ...cur, criteria: sp.acceptanceCriteria.join("\n") }));
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const amt = Number(f.amount);
    if (!(amt > 0) || !/^[A-Z]{3}$/.test(f.currency) || !/^[A-Z]{3}$/.test(f.receiveCurrency)) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fx/quote?amount=${amt}&from=${f.currency}&to=${f.receiveCurrency}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setQuote(j); setQErr(null);
      } catch (e) { setQuote(null); setQErr((e as Error).message); }
    }, 400);
    return () => clearTimeout(t);
  }, [f.amount, f.currency, f.receiveCurrency]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (spec && !specOk) { setErr("Please review the extracted spec and tick \"This is correct\" first."); return; }
    setBusy(true); setErr(null);
    try {
      const body = { payer: f.payer, payerEmail: f.payerEmail, recipient: f.recipient, recipientType: f.recipientType, ...(f.recipientType === "EMAIL" ? { recipientEmail: f.recipientEmail || undefined } : f.recipientType === "PHONE" ? { recipientPhone: f.recipientEmail } : { recipientPayerId: f.recipientEmail }), receiveCurrency: f.receiveCurrency, recipientCountry: f.recipientCountry.toUpperCase(), amount: Number(f.amount), currency: f.currency, specification: f.specification, acceptanceCriteria: f.criteria.split("\n").map((s) => s.trim()).filter(Boolean), ...(spec ? { structuredSpec: { ...spec, acceptanceCriteria: f.criteria.split("\n").map((s) => s.trim()).filter(Boolean) } } : {}), ...(specDoc ? { specDocument: specDoc } : {}) };
      const r = await fetch("/api/escrow/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "Invalid input" ? "Check the form: " + (j.details?.map((d: { path: string[] }) => d.path.join(".")).join(", ") ?? "") : j.error);
      saveLinks(j.id, j.links); setMade({ id: j.id, links: j.links });
      toast({ tone: "ok", title: "Escrow created", body: "Share each private link with the right person." });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (made) return (
    <div className="space-y-6">
      <PageHeader eyebrow={made.id} title="Escrow created">Three private links, one per role. Each is signed for that role only. They are saved on this device and never sent to PayPal.</PageHeader>
      <Stepper current={3} skip={[0, 1, 2]} compact />
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(made.links).map(([role, url]) => (
          <Card key={role}>
            <Eyebrow>{role}</Eyebrow>
            <p className="mt-1 text-sm text-mut">{ROLE_TEXT[role]}</p>
            <div className="mt-3 flex gap-2">
              <a href={url} className="btn-primary rounded-full px-4 py-2 text-sm font-bold">Open</a>
              <button className="btn-ghost rounded-full px-4 py-2 text-sm font-bold" onClick={() => { navigator.clipboard.writeText(url); toast({ tone: "ok", title: `${role} link copied` }); }}>Copy link</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Escrow" title="Open an escrow">Funds are held after PayPal capture. The AI checks the deliverable against your specification, then a human releases a PayPal Payout to any supported country.</PageHeader>
      <Stepper current={3} skip={[0, 1, 2]} compact />
      <form onSubmit={create} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Payer name<input className="cs-field mt-1" required value={f.payer} onChange={set("payer")} /></label>
            <label className="text-sm font-semibold">Payer email<input type="email" className="cs-field mt-1" required value={f.payerEmail} onChange={set("payerEmail")} /></label>
            <label className="text-sm font-semibold">Recipient name<input className="cs-field mt-1" required value={f.recipient} onChange={set("recipient")} /></label>
            <label className="text-sm font-semibold">Recipient PayPal {f.recipientType === "EMAIL" ? "email" : f.recipientType === "PHONE" ? "phone (+country code)" : "payer ID"}
              <div className="mt-1 flex gap-1"><select className="cs-field w-28" value={f.recipientType} onChange={(e) => setF({ ...f, recipientType: e.target.value as RecipientType })}><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="PAYPAL_ID">PayPal ID</option></select>
              <input type={f.recipientType === "EMAIL" ? "email" : "text"} className="cs-field" required value={f.recipientEmail} onChange={set("recipientEmail")} /></div></label>
            <label className="text-sm font-semibold">Recipient country (PayPal Payouts list)<select className="cs-field mt-1" required value={f.recipientCountry} onChange={(e) => setF({ ...f, recipientCountry: e.target.value })}>{Object.entries(PAYOUT_COUNTRIES).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold">Amount<input type="number" min="1" step="0.01" className="cs-field mt-1" required value={f.amount} onChange={set("amount")} /></label>
              <label className="text-sm font-semibold">Currency<select className="cs-field mt-1" required value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{PAYOUT_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-blue-300 p-3">
            <label className="block text-sm font-semibold">Upload a spec document (PDF, DOCX, TXT): AI extracts deliverables and criteria for you to confirm
              <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" className="mt-2 block text-sm" disabled={specBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadSpec(file); }} />
            </label>
            {specBusy && <p className="mt-2 text-sm text-mut">Reading the document and extracting the spec with the free model…</p>}
            {specErr && <ErrorBox>{specErr}</ErrorBox>}
          </div>
          {spec && <>
            <SpecReview spec={spec} onChange={editSpec} model={specModel} />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={specOk} onChange={(e) => setSpecOk(e.target.checked)} /> This is correct. Use it as the escrow spec the AI verifier will check against.</label>
          </>}
          {(() => { const el = checkPayoutEligibility(f.recipientCountry, f.currency); return el.ok ? <p className="rounded-xl bg-blue-50 p-2 text-xs text-slate-700">{el.warnings.join(" ")} Not on PayPal&apos;s Payouts country list (e.g. Nigeria, Ghana)? PayPal can&apos;t pay out there.</p> : <ErrorBox>{el.error}</ErrorBox>; })()}
          <label className="block text-sm font-semibold">Specification (what must be delivered)<textarea className="cs-field mt-1 min-h-24" required value={f.specification} onChange={set("specification")} /></label>
          <label className="block text-sm font-semibold">Acceptance criteria (one per line, optional)<textarea className="cs-field mt-1 min-h-20" value={f.criteria} onChange={set("criteria")} /></label>
          {err && <ErrorBox>{err}</ErrorBox>}
          <button disabled={busy} className="btn-primary rounded-full px-6 py-3 font-bold disabled:opacity-60">{busy ? "Creating…" : "Create escrow and get the three links"}</button>
          <SandboxNote />
        </Card>
        <Card>
          <Eyebrow>Live FX quote</Eyebrow>
          <label className="mt-3 block text-sm font-semibold">Recipient receives in<input className="cs-field mt-1" maxLength={3} value={f.receiveCurrency} onChange={(e) => setF({ ...f, receiveCurrency: e.target.value.toUpperCase() })} /></label>
          <div className="mt-4">
            {qErr ? <ErrorBox>{qErr}</ErrorBox> : !quote ? <Skeleton className="h-32" /> : (
              <>
                <Row k="Mid-market rate" v={`${quote.midRate.toFixed(4)} (${quote.source})`} />
                <Row k={`After ${quote.spreadPct}% FX spread`} v={quote.effectiveRate.toFixed(4)} />
                <Row k="ClearSend fee (2.5%)" v={<Money amount={quote.fee} currency={f.currency} />} />
                <Row k="Payer is charged" v={<Money amount={quote.totalCharged} currency={f.currency} />} />
                <Row strong k="Recipient gets about" v={<Money amount={quote.received} currency={quote.to} className="c-ok" />} />
                <p className="mt-2 text-[11px] text-mut">All parties see this quote. PayPal pays {f.currency} into the recipient&apos;s PayPal account and converts with its own rate; the recipient withdraws to their local bank from PayPal. </p>
                <p className="mt-2 text-[11px] text-mut">Quoted {new Date(quote.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos" })} WAT. Indicative; the escrow holds {f.currency}.</p>
              </>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
}

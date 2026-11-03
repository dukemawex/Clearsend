"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/room/Toaster";
import { ButtonLink, Card, ErrorBox, PageHeader, Row, SandboxNote } from "@/components/room/ui";
import { payerLink } from "@/lib/creds";

// PayPal sends the payer back here with ?token=<orderId>&PayerID=. The URL carries no role or trip token.
// Capture is a money move, so it still needs the payer to type CAPTURE.
export default function ReturnClient() {
  const sp = useSearchParams();
  const kind = sp.get("kind") ?? "order";
  const id = sp.get("id") ?? "";
  const orderId = sp.get("token") ?? "";
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [roleUrl, setRoleUrl] = useState<string | null>(null);
  useEffect(() => { if (kind === "escrow" && id) setRoleUrl(payerLink(id)); }, [kind, id]);

  async function capture() {
    setBusy(true); setErr(null);
    try {
      const res = kind === "escrow"
        ? await fetch("/api/escrow/fund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ escrowId: id, orderId }) })
        : await fetch(`/api/trips/${encodeURIComponent(id)}/book`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setDone(kind === "escrow" ? "Escrow funded. The recipient can now submit the deliverable." : `Payment captured. Trip state: ${j.state ?? "paid"}.`);
      toast({ tone: "ok", title: "PayPal sandbox capture complete" });
    } catch (e) { setErr((e as Error).message); toast({ tone: "bad", title: "Capture failed", body: (e as Error).message }); }
    finally { setBusy(false); }
  }

  if (!orderId) return <><PageHeader eyebrow="PayPal sandbox" title="No PayPal order" /><ErrorBox>This page is opened by PayPal after approval. No order token was found.</ErrorBox></>;
  return (
    <>
      <PageHeader eyebrow="Step 4 · Pay with PayPal" title="You approved in PayPal">One last step: capture the approved sandbox payment.</PageHeader>
      <Card className="max-w-xl space-y-4">
        <div><Row k="PayPal order" v={<code>{orderId}</code>} /><Row k="For" v={kind === "order" ? "Agent chat order" : `${kind} ${id}`} /></div>
        {kind === "order" ? (
          <p className="text-sm">Go back to the agent chat and tell it you approved. It will ask you to confirm before capturing. <ButtonLink href="/agent" className="mt-3">Back to the agent</ButtonLink></p>
        ) : done ? (
          <div className="space-y-3"><div className="rounded-2xl bg-ok p-4 text-sm c-ok">{done}</div>
            <div className="flex flex-wrap gap-2">{kind === "trip" ? <ButtonLink href={`/trips/${id}`}>View trip</ButtonLink> : roleUrl ? <ButtonLink href={roleUrl}>Open payer view</ButtonLink> : <ButtonLink href="/escrow">Escrows</ButtonLink>}<ButtonLink href="/activity" variant="ghost">Activity</ButtonLink></div></div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-semibold" htmlFor="cap">Type <code>CAPTURE</code> to take the payment</label>
            <input id="cap" className="cs-field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <button onClick={capture} disabled={busy || typed.trim() !== "CAPTURE"} className="btn-paypal w-full rounded-full px-6 py-3 font-bold disabled:opacity-50">{busy ? "Capturing…" : "Capture with PayPal (sandbox)"}</button>
            {err && <ErrorBox>{err}</ErrorBox>}
          </div>
        )}
        <SandboxNote />
      </Card>
    </>
  );
}

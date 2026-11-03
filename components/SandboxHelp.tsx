"use client";
import { useEffect, useState } from "react";

type Help = { sandbox: boolean; buyer: { email: string; password: string } | null; testCard: { brand: string; number: string; source: string } | null };

function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="ml-2 rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-50" aria-label={`Copy ${label}`}>{done ? "Copied" : "Copy"}</button>;
}

/** Explains PayPal sandbox checkout honestly: only sandbox accounts or sandbox test cards work; no real sign-up. */
export function SandboxHelp({ compact = false }: { compact?: boolean }) {
  const [h, setH] = useState<Help | null>(null);
  useEffect(() => { fetch("/api/paypal/sandbox-help", { cache: "no-store" }).then((r) => r.json()).then(setH).catch(() => setH(null)); }, []);
  if (h && !h.sandbox) return null;
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-slate-800" data-testid="sandbox-help">
      <p className="font-bold text-blue-900">🧪 Sandbox test payment: no real money</p>
      <p className="mt-1">PayPal will open its <b>sandbox</b> checkout. Your real PayPal login and real cards will not work there, and the sandbox has no public sign-up. Use one of these:</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li><b>Log in with a sandbox buyer account.</b>{h?.buyer ? (
          <div className="mt-1 space-y-1 rounded-xl bg-white p-2 font-mono text-xs">
            <div>Email: {h.buyer.email}<Copy value={h.buyer.email} label="sandbox email" /></div>
            <div>Password: {h.buyer.password}<Copy value={h.buyer.password} label="sandbox password" /></div>
          </div>
        ) : <span> Create one free at <a className="underline" href="https://developer.paypal.com/dashboard/accounts" target="_blank" rel="noreferrer">developer.paypal.com → Sandbox accounts</a> (Personal type), then use its email and password.</span>}</li>
        <li><b>Or pay as a guest with a test card</b> if PayPal shows <i>Pay with Debit or Credit Card</i> (PayPal decides when it appears, by country and account). PayPal documents test cards like Visa <span className="font-mono">4012 8888 8888 1881</span><Copy value="4012888888881881" label="test card" />, any future expiry, any 3-digit CVV, any name and address. <a className="underline" href="https://developer.paypal.com/tools/sandbox/card-testing/" target="_blank" rel="noreferrer">PayPal card testing docs</a>.</li>
      </ol>
      {!compact && <p className="mt-2 text-xs text-slate-600">After you press Pay in PayPal you come back here and type CAPTURE. If you close PayPal, nothing is charged and you can retry from the escrow page.</p>}
    </div>
  );
}

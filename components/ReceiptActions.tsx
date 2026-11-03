"use client";
import { useState } from "react";

export function ReceiptActions({ shareUrl }: { shareUrl?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold btn-primary">Download PDF / Print</button>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl ?? window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold btn-ghost">{copied ? "Link copied" : "Copy link"}</button>
    </div>
  );
}

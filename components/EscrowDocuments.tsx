"use client";

import { useRef, useState } from "react";
import type { EscrowRecord } from "@/lib/escrow";
import type { EscrowRole } from "@/lib/escrow-links";

const ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

export function EscrowDocuments({ escrow, role, token, onChange }: { escrow: EscrowRecord; role: EscrowRole; token: string | null; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const docs = escrow.documents ?? [];
  const canSpec = role === "payer" && ["created", "funded"].includes(escrow.state);
  const canDeliver = role === "recipient" && escrow.state === "funded";
  const kind = canSpec ? "spec" : canDeliver ? "deliverable" : null;

  async function upload(file: File) {
    if (!kind || !token) return;
    if (file.size > 4.5 * 1024 * 1024) { setMessage("Files over 4.5 MB exceed Vercel's request limit. Please upload a smaller file."); return; }
    setBusy(true);
    setMessage(undefined);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("escrowId", escrow.id);
      form.set("role", role);
      form.set("token", token);
      form.set("kind", kind);
      const res = await fetch("/api/escrow/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMessage(data.document.note ?? `Read ${data.document.chars.toLocaleString()} characters from ${data.document.name}. The AI verifier will check this text.`);
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (!docs.length && !kind) return null;
  return (
    <section className="mb-6 rounded-xl border bg-white p-5" aria-label="Escrow documents">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Documents</h3>
          <p className="text-sm text-gray-600">Payer uploads the spec, recipient uploads the deliverable. The AI verifier reads the extracted text and compares the two before any PayPal payout.</p>
        </div>
        {kind && (
          <>
            <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label={`Upload ${kind} document`} />
            <button type="button" disabled={busy || !token} onClick={() => input.current?.click()} className="doc-upload-button">
              {busy ? "Reading…" : kind === "spec" ? "📎 Upload spec" : "📎 Upload deliverable"}
            </button>
          </>
        )}
      </div>
      {kind && <p className="mt-2 text-xs text-gray-500">PDF, DOCX, TXT/MD or image, up to 5 MB (4.5 MB on Vercel). Text is extracted only; files are never run. Image text needs OCR, which may be unavailable on the server.</p>}
      {message && <p className="mt-2 text-sm text-gray-800" role="status">{message}</p>}
      {docs.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {docs.map((d, i) => (
            <li key={i} className="file-chip" title={d.note ?? `${d.text.length} characters extracted via ${d.method}`}>
              <span className="file-chip-role">{d.role}</span> {d.name} <span className="file-chip-meta">{Math.ceil(d.size / 1024)} KB · {d.method}{d.truncated ? " · truncated" : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";
import type { StructuredSpec } from "@/lib/spec";

const lines = (xs: string[]) => xs.join("\n");
const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Read-only spec shown on every role page. */
export function SpecView({ spec }: { spec: StructuredSpec }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-sm" data-testid="spec-view">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Structured spec (AI-extracted, confirmed by payer)</p>
      {spec.title && <p className="mt-1 font-semibold">{spec.title}</p>}
      {spec.summary && <p className="mt-1 text-gray-700">{spec.summary}</p>}
      {spec.deliverables.length > 0 && <><p className="mt-2 font-medium">Deliverables</p><ul className="list-disc pl-5">{spec.deliverables.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
      {spec.acceptanceCriteria.length > 0 && <><p className="mt-2 font-medium">Acceptance criteria</p><ol className="list-decimal pl-5">{spec.acceptanceCriteria.map((d, i) => <li key={i}>{d}</li>)}</ol></>}
      {spec.deadline && <p className="mt-2"><b>Deadline:</b> {spec.deadline}</p>}
      {spec.ambiguities.length > 0 && <><p className="mt-2 font-medium text-amber-700">Open questions noted at creation</p><ul className="list-disc pl-5 text-amber-800">{spec.ambiguities.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
    </div>
  );
}

/** Editable review card shown before the escrow is created. */
export function SpecReview({ spec, onChange, model }: { spec: StructuredSpec; onChange: (s: StructuredSpec) => void; model?: string }) {
  const set = <K extends keyof StructuredSpec>(k: K, v: StructuredSpec[K]) => onChange({ ...spec, [k]: v });
  return (
    <div className="space-y-3 rounded-2xl border-2 border-blue-300 bg-white p-4" data-testid="spec-review">
      <p className="font-bold text-blue-900">Here is what I understood. Confirm or edit.</p>
      {!spec.clearSpec && <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-900">This document doesn&apos;t clearly state a spec. I didn&apos;t invent anything; please fill in what&apos;s missing below.</p>}
      {spec.injectionDetected && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-800">⚠️ The document contains instructions aimed at the AI or payment system. They were ignored and not used as criteria.</p>}
      <label className="block text-sm font-semibold">Title<input className="cs-field mt-1" value={spec.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="block text-sm font-semibold">Summary<textarea className="cs-field mt-1 min-h-16" value={spec.summary} onChange={(e) => set("summary", e.target.value)} /></label>
      <label className="block text-sm font-semibold">Deliverables (one per line)<textarea className="cs-field mt-1 min-h-16" value={lines(spec.deliverables)} onChange={(e) => set("deliverables", split(e.target.value))} /></label>
      <label className="block text-sm font-semibold">Acceptance criteria (one per line, measurable)<textarea className="cs-field mt-1 min-h-20" value={lines(spec.acceptanceCriteria)} onChange={(e) => set("acceptanceCriteria", split(e.target.value))} /></label>
      <label className="block text-sm font-semibold">Deadline<input className="cs-field mt-1" value={spec.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} /></label>
      {spec.ambiguities.length > 0 && <div className="rounded-xl bg-amber-50 p-2 text-sm"><p className="font-semibold text-amber-900">What&apos;s unclear: please answer by editing the fields</p><ul className="list-disc pl-5 text-amber-900">{spec.ambiguities.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
      {model && <p className="text-[11px] text-gray-500">Extracted by {model}. The document is treated as untrusted data.</p>}
    </div>
  );
}

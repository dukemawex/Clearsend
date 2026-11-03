"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, cx, Skeleton } from "./ui";

type Item = { id: string; at: string; kind: string; subject: string; actor: string; summary: string };

const KIND: Record<string, { tone: "ok" | "warn" | "bad" | "acc" | "mut"; label: string }> = {
  paypal: { tone: "warn", label: "PayPal" }, decision: { tone: "ok", label: "AI decision" }, confirmation: { tone: "acc", label: "Human yes" },
  escrow: { tone: "acc", label: "Escrow" }, trip: { tone: "acc", label: "Trip" }, "flight-search": { tone: "mut", label: "Search" },
  chat: { tone: "acc", label: "Chat bot" }, status: { tone: "mut", label: "Agent status" }, system: { tone: "mut", label: "System" },
};
const isAgent = (a: string) => /^(agent|clearsend|web)$/i.test(a);
const link = (s: string) => (s.startsWith("trip_") ? `/trips/${s}` : null);

/** Transcript-style mirror of what the agent, web users and chat bots did. Polls the real activity log. */
export function RoomFeed({ limit = 30, kind, subject, q, poll = 10_000, tall }: { limit?: number; kind?: string; subject?: string; q?: string; poll?: number; tall?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: String(limit), ...(kind ? { kind } : {}), ...(subject ? { subject } : {}), ...(q ? { q } : {}) });
      const r = await fetch(`/api/activity?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setItems(j.items); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [limit, kind, subject, q]);
  useEffect(() => { setItems(null); load(); const t = setInterval(load, poll); return () => clearInterval(t); }, [load, poll]);

  if (error && !items) return <div role="alert" className="rounded-2xl bg-bad p-4 text-sm c-bad">Activity unavailable: {error}</div>;
  if (!items) return <div className="space-y-3" aria-busy>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (!items.length) return <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-mut">Nothing yet. Nothing is seeded, so this stays empty until someone uses the agent chat, <b>Plan a trip</b>, <b>New escrow</b>, or the Telegram bots.</div>;
  return (
    <ol className={cx("space-y-3 overflow-y-auto pr-1", tall ? "max-h-[70vh]" : "max-h-[460px]")} aria-label="Activity">
      {[...items].reverse().map((a) => {
        const agent = isAgent(a.actor);
        const k = KIND[a.kind] ?? { tone: "mut" as const, label: a.kind };
        const href = link(a.subject);
        return (
          <li key={a.id} className={cx("cs-rise flex gap-3", !agent && "flex-row-reverse")}>
            <div className={cx("grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold", agent ? "btn-primary" : "cs-tint c-acc")} aria-hidden>{agent ? "CS" : a.actor.replace(/^telegram:/, "").slice(0, 2).toUpperCase()}</div>
            <div className={cx("max-w-[85%] rounded-2xl border border-line px-4 py-2.5", agent ? "bg-[var(--card)] rounded-tl-sm" : "cs-tint rounded-tr-sm")}>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-mut">
                <b style={{ color: "var(--fg)" }}>{agent ? "ClearSend" : a.actor}</b>
                <Badge tone={k.tone}>{k.label}</Badge>
                <time dateTime={a.at}>{new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })} WAT</time>
              </div>
              <div className="mt-1 text-sm">{a.summary}</div>
              <div className="mt-1 font-mono text-[10px] text-mut">{href ? <a className="underline" href={href}>{a.subject}</a> : a.subject}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

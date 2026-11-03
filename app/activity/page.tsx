"use client";
import { useState } from "react";
import { RoomFeed } from "@/components/room/RoomFeed";
import { Card, cx, PageHeader, Room } from "@/components/room/ui";

const KINDS = [["", "All"], ["paypal", "PayPal"], ["decision", "AI decisions"], ["confirmation", "Human yes"], ["escrow", "Escrow"], ["trip", "Trips"], ["flight-search", "Searches"], ["chat", "Chat bots"], ["status", "Agent status"]] as const;

export default function ActivityPage() {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  return (
    <Room>
      <PageHeader eyebrow="Audit trail" title="Activity">Every search, choice, PayPal call, AI decision and human confirmation, from the web app, the agent and the Telegram/Discord bots. Read from the live log; nothing is seeded.</PageHeader>
      <Card className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by kind">
          {KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={cx("rounded-full px-3 py-1.5 text-sm", kind === k ? "btn-primary font-bold" : "btn-ghost")}>{l}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="cs-field" placeholder="Search text, actor or id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <input className="cs-field" placeholder="Exact record id (escrow_… or trip_…)" value={subject} onChange={(e) => setSubject(e.target.value.trim())} aria-label="Record id" />
        </div>
      </Card>
      <Card><RoomFeed limit={200} kind={kind || undefined} q={q || undefined} subject={subject || undefined} tall /></Card>
    </Room>
  );
}

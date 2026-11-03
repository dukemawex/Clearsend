import Link from "next/link";
import { RoomFeed } from "@/components/room/RoomFeed";
import { Stepper } from "@/components/room/Stepper";
import { Badge, ButtonLink, Card, ErrorBox, Eyebrow, Money, Room, StateBadge } from "@/components/room/ui";
import { ClearSendLogo } from "@/components/clearsend-logo";
import { listActivity } from "@/lib/activity";
import { listEscrows } from "@/lib/escrow";
import { listTrips } from "@/lib/trips";
import { escrowStep, tripStep, WORKFLOW } from "@/lib/workflow";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try { return { data: await fn() }; } catch (e) { return { error: (e as Error).message }; }
}

const PARTIES = [
  { role: "Payer", icon: "💳", text: "Asks the agent for a flight or opens an escrow, types the yes that creates the PayPal order, approves it in PayPal, and types the amount to release." },
  { role: "Recipient", icon: "📦", text: "Delivers the work (text or a document). Gets paid by PayPal Payout to any supported country. Can never release to themselves." },
  { role: "Verifier", icon: "🛡️", text: "Reads the AI verdict criterion by criterion and confirms, or flags it so the payer can refund." },
  { role: "ClearSend agent", icon: "✦", text: "Free model via OpenRouter, on the web, Telegram and Discord. Searches, quotes, creates orders and verifies. Never moves money without a human yes." },
];

export default async function Home() {
  const since = Date.now() - 7 * 864e5;
  const [esc, trips, searches] = await Promise.all([safe(listEscrows), safe(() => listTrips()), safe(() => listActivity(200, { kind: "flight-search" }))]);
  const err = esc.error || trips.error;
  const counts = WORKFLOW.map(() => 0);
  counts[0] = (searches.data ?? []).filter((a) => Date.parse(a.at) > since).length;
  for (const t of trips.data ?? []) { const s = tripStep(t.state); if (s < 9) counts[s]++; }
  for (const e of esc.data ?? []) { const s = escrowStep(e.state); if (s < 9) counts[s]++; else if (e.state === "released") counts[8]++; }
  const waiting = (esc.data ?? []).filter((e) => ["created", "verified", "rejected"].includes(e.state)).length + (trips.data ?? []).filter((t) => tripStep(t.state) < 9).length;
  const latest = [
    ...(esc.data ?? []).map((e) => ({ kind: "escrow" as const, id: e.id, title: `${e.payer} → ${e.recipient} (${e.recipientCountry})`, state: e.state, amount: e.amount, cur: e.currency, at: e.createdAt })),
    ...(trips.data ?? []).map((t) => ({ kind: "trip" as const, id: t.id, title: `${t.airline} ${t.origin} → ${t.destination}`, state: t.state, amount: t.totalPrice, cur: t.currency, at: t.createdAt })),
  ].sort((a, b) => b.at - a.at).slice(0, 6);

  return (
    <Room>
      <div className="space-y-14">
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="cs-rise">
            <Badge tone="acc">AI agent · PayPal sandbox · Web, Telegram, Discord</Badge>
            <div className="mt-5"><ClearSendLogo /></div>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl" style={{ letterSpacing: "-0.04em" }}>
              One room for the payer, the recipient, the verifier and <span className="c-acc">the agent</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-mut">ClearSend books flights and settles cross-border escrow through PayPal. The agent does the work; every money move waits for the right person to say yes.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/agent">Talk to the agent</ButtonLink>
              <ButtonLink href="/plan" variant="ghost">Plan a trip</ButtonLink>
              <ButtonLink href="/escrow/new" variant="ghost">Open an escrow</ButtonLink>
              <ButtonLink href="/chat-bots" variant="ghost">Add to Telegram / Discord</ButtonLink>
            </div>
          </div>
          <Card className="cs-rise">
            <div className="flex items-center justify-between">
              <Eyebrow>Live activity</Eyebrow>
              <span className="flex items-center gap-1.5 text-xs text-mut"><span className="live-dot" />polling every 10s</span>
            </div>
            <div className="mt-4"><RoomFeed limit={12} /></div>
            <Link href="/activity" className="mt-3 inline-block text-sm c-acc underline">Full activity log</Link>
          </Card>
        </section>

        {err && <ErrorBox>Storage unavailable: {err}</ErrorBox>}

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><Eyebrow>The workflow</Eyebrow><h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">Nine steps, three humans, one agent</h2></div>
            <p className="text-sm text-mut">Numbers are live records waiting at each step (searches: last 7 days).</p>
          </div>
          <Stepper counts={counts} />
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Card><Eyebrow>Escrows</Eyebrow><div className="mt-2 text-4xl font-extrabold">{esc.data?.length ?? "–"}</div><Link className="mt-1 inline-block text-sm text-mut underline" href="/escrow">View all</Link></Card>
          <Card><Eyebrow>Trips</Eyebrow><div className="mt-2 text-4xl font-extrabold">{trips.data?.length ?? "–"}</div><Link className="mt-1 inline-block text-sm text-mut underline" href="/trips">View all</Link></Card>
          <Card><Eyebrow>Waiting on a human</Eyebrow><div className="mt-2 text-4xl font-extrabold">{err ? "–" : waiting}</div><span className="text-sm text-mut">unpaid trips, unfunded or verified escrows</span></Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <Eyebrow>Who is involved</Eyebrow>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PARTIES.map((p) => (
                <Card key={p.role} className="p-5"><div className="text-2xl" aria-hidden>{p.icon}</div><div className="mt-2 font-bold">{p.role}</div><p className="mt-1 text-sm text-mut">{p.text}</p></Card>
              ))}
            </div>
          </div>
          <div>
            <Eyebrow>Latest records</Eyebrow>
            <Card className="mt-3 p-2">
              {latest.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {latest.map((r) => (
                    <li key={r.id}>
                      <Link href={r.kind === "escrow" ? "/escrow" : `/trips/${r.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-[var(--tint)]">
                        <span className="text-lg" aria-hidden>{r.kind === "escrow" ? "🔒" : "✈️"}</span>
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{r.title}</div><div className="font-mono text-[11px] text-mut">{r.id}</div></div>
                        <Money amount={r.amount} currency={r.cur} className="text-sm font-bold" />
                        <StateBadge state={r.state} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <div className="p-6 text-center text-sm text-mut">No trips or escrows yet. Nothing is seeded.</div>}
            </Card>
          </div>
        </section>
      </div>
    </Room>
  );
}

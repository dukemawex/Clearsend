"use client";
import { useState } from "react";
import { Stepper } from "@/components/room/Stepper";
import { useToast } from "@/components/room/Toaster";
import { SandboxHelp } from "@/components/SandboxHelp";
import { Badge, Card, cx, ErrorBox, Eyebrow, Money, PageHeader, Row, SandboxNote, Skeleton } from "@/components/room/ui";

type Offer = { id: string; provider: string; airline: string; airlineCode?: string | null; route: string; origin: string; destination: string; depart: string; arrive: string; stops: number; duration?: string; price: number | null; currency: string; isCheapest?: boolean; scheduleOnly?: boolean; priceLabel?: string; evidence?: { replayUrl?: string; liveViewUrl?: string; searchUrl: string } };
type Search = { provider: string | null; origin: string; destination: string; dateUsed: string | null; options: Offer[]; success: boolean; message?: string; note?: string; providers: { name: string; status: string; message?: string }[]; priced: number; evidence?: { replayUrl?: string; liveViewUrl?: string; searchUrl: string } };
type Trip = { id: string; state: string; priceLabel?: string; provider?: string; basePrice: number; serviceFee: number; totalPrice: number; currency: string; airline: string; origin: string; destination: string; departureDate: string };
const YES = /\b(yes|confirm|book it|go ahead|proceed|pay)\b/i;
const priced = (o: Offer) => typeof o.price === "number" && o.price > 0 && !o.scheduleOnly && (o.provider === "kernel" || o.provider === "rapidapi" || o.provider === "duffel");
const tomorrow = () => new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

export default function PlanTrip() {
  const toast = useToast();
  const [form, setForm] = useState({ origin: "", destination: "", date: tomorrow() });
  const [search, setSearch] = useState<Search | null>(null);
  const [filter, setFilter] = useState<"all" | "priced">("all");
  const [chosen, setChosen] = useState<Offer | null>(null);
  const [pax, setPax] = useState({ title: "mr", firstName: "", lastName: "", gender: "male", dateOfBirth: "", email: "", phone: "" });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState<"" | "search" | "trip" | "pay">("");
  const [error, setError] = useState<string | null>(null);

  const step = trip ? 3 : chosen ? 2 : search ? 1 : 0;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j as T;
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault(); setLoading("search"); setError(null); setSearch(null); setChosen(null); setTrip(null);
    try { setSearch(await call<Search>("/api/flights/search", { method: "POST", body: JSON.stringify(form) })); }
    catch (e) { setError((e as Error).message); } finally { setLoading(""); }
  }

  async function makeTrip(e: React.FormEvent) {
    e.preventDefault(); if (!chosen || chosen.price == null) return;
    setLoading("trip"); setError(null);
    try {
      const t = await call<Trip>("/api/trips/create", { method: "POST", body: JSON.stringify({ origin: chosen.origin, destination: chosen.destination, departureDate: chosen.depart.slice(0, 10) || search?.dateUsed, airline: chosen.airline, airlineCode: chosen.airlineCode, duration: chosen.duration, stops: chosen.stops, departureTime: chosen.depart, arrivalTime: chosen.arrive, basePrice: chosen.price, currency: chosen.currency, provider: chosen.provider, providerOfferId: chosen.id, kernelEvidence: chosen.evidence }, (_k, v) => (v === null ? undefined : v)) });
      const withPax = await call<Trip>(`/api/trips/${t.id}/passenger`, { method: "POST", body: JSON.stringify(pax) });
      setTrip(withPax);
    } catch (e) { setError((e as Error).message); } finally { setLoading(""); }
  }

  async function pay() {
    if (!trip) return; setLoading("pay"); setError(null);
    try {
      const r = await call<{ approveUrl?: string; orderId: string }>(`/api/trips/${trip.id}/book`, { method: "POST" });
      if (!r.approveUrl) throw new Error("PayPal returned no approval link.");
      toast({ tone: "info", title: "Opening PayPal sandbox", body: `Order ${r.orderId}` });
      window.location.href = r.approveUrl;
    } catch (e) { setError((e as Error).message); setLoading(""); }
  }

  const shown = (search?.options ?? []).filter((o) => filter === "all" || priced(o));
  const set = (k: keyof typeof pax) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setPax({ ...pax, [k]: e.target.value });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Steps 1–4" title="Plan a trip">The same flow the agent runs in chat: search, choose, confirm, then pay with PayPal. Real fares only; open-data results are shown as <b>fare unavailable</b>.</PageHeader>
      <Stepper current={step} compact />

      <Card>
        <form onSubmit={doSearch} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-semibold">From<input className="cs-field mt-1" placeholder="Lagos or LOS" required value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></label>
          <label className="text-sm font-semibold">To<input className="cs-field mt-1" placeholder="London or LHR" required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
          <label className="text-sm font-semibold">Date<input type="date" className="cs-field mt-1" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <button disabled={loading === "search"} className="btn-primary h-[42px] rounded-xl px-6 text-sm font-bold disabled:opacity-60">{loading === "search" ? "Searching…" : "Search flights"}</button>
        </form>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      {loading === "search" && <div className="space-y-3" aria-busy><p className="text-sm text-mut">Querying live Google Flights fares via Kernel, plus Duffel test offers. This can take up to a minute when a provider is slow.</p>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}

      {search && !trip && !chosen && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Sources</Eyebrow>
            {search.providers.map((p) => <Badge key={p.name} tone={p.status === "success" ? "ok" : p.status === "error" ? "bad" : "mut"}><span title={p.message}>{p.name}: {p.status}</span></Badge>)}
            <div className="ml-auto flex gap-1 rounded-full border border-line p-1 text-xs">
              {(["all", "priced"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cx("rounded-full px-3 py-1", filter === f && "btn-primary font-bold")}>{f === "all" ? `All (${search.options.length})` : `Bookable (${search.options.filter(priced).length})`}</button>)}
            </div>
          </div>
          {search.message && <p className="text-sm text-mut">{search.message}</p>}
          {search.provider === "kernel" && search.evidence && <p className="text-xs text-mut">Prices read live from <a className="underline" href={search.evidence.searchUrl} target="_blank" rel="noreferrer">Google Flights</a> in a Kernel cloud browser{search.evidence.replayUrl && <> · <a className="underline" href={search.evidence.replayUrl} target="_blank" rel="noreferrer">session replay</a></>}. Booking is a test booking via the Duffel sandbox; no real ticket is issued.</p>}
          {!search.options.some(priced) && <div className="rounded-2xl bg-warn p-4 text-sm c-warn">No live fare came back, so nothing here can be booked. Schedule-only results are real flights or routes shown as <b>fare unavailable</b>. ClearSend never invents a price.</div>}
          {!shown.length && <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-mut">No options for this filter.</div>}
          <h2 className="text-xl font-extrabold">Which flight would you like?</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.slice(0, 40).map((o, i) => (
              <li key={o.id}>
                <button onClick={() => priced(o) && setChosen(o)} disabled={!priced(o)} className={cx("cs-card w-full p-4 text-left transition", priced(o) ? "hover:-translate-y-0.5" : "cursor-not-allowed opacity-75")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{o.airline}</span><Badge tone={priced(o) ? "acc" : "mut"}>{o.provider === "kernel" ? "Google Flights" : o.provider}</Badge>{o.isCheapest && <Badge tone="ok">cheapest</Badge>}</div>
                      <div className="mt-1 text-sm text-mut">{o.origin} → {o.destination} · {o.stops ? `${o.stops} stop${o.stops > 1 ? "s" : ""}` : "nonstop"}{o.depart && ` · ${o.depart.replace("T", " ").slice(0, 16)}`}{o.duration && ` · ${o.duration}`}</div>
                    </div>
                    <div className="text-right">{priced(o) ? <Money amount={o.price!} currency={o.currency} className="text-xl font-extrabold c-acc" /> : <span className="text-sm font-bold text-mut">fare unavailable</span>}<div className="text-[11px] text-mut">option #{i + 1}</div></div>
                  </div>
                  {o.provider === "duffel" && <p className="mt-2 text-[11px] c-warn">Duffel test-mode fare (sandbox airline data).</p>}
                  {o.provider === "kernel" && <p className="mt-2 text-[11px] c-acc"><b>Live market price (Google Flights)</b> · booking is a Test booking via Duffel sandbox</p>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chosen && !trip && (
        <form onSubmit={makeTrip} className="cs-rise">
          <Card className="space-y-5">
            <div>
              <Eyebrow>Step 2 · You chose {chosen.airline}</Eyebrow>
              <h2 className="mt-1 text-2xl font-extrabold">{chosen.origin} → {chosen.destination} · <Money amount={chosen.price!} currency={chosen.currency} /></h2>
              <p className="text-sm text-mut">Would you like me to book this for you and pay with your PayPal account? First, who is flying?</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm font-semibold">Title<select className="cs-field mt-1" value={pax.title} onChange={set("title")}>{["mr", "ms", "mrs", "dr"].map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="text-sm font-semibold">First name<input className="cs-field mt-1" required value={pax.firstName} onChange={set("firstName")} /></label>
              <label className="text-sm font-semibold">Last name<input className="cs-field mt-1" required value={pax.lastName} onChange={set("lastName")} /></label>
              <label className="text-sm font-semibold">Gender<select className="cs-field mt-1" value={pax.gender} onChange={set("gender")}><option>male</option><option>female</option></select></label>
              <label className="text-sm font-semibold">Date of birth<input type="date" className="cs-field mt-1" required value={pax.dateOfBirth} onChange={set("dateOfBirth")} /></label>
              <label className="text-sm font-semibold">Email<input type="email" className="cs-field mt-1" required value={pax.email} onChange={set("email")} /></label>
              <label className="text-sm font-semibold">Phone<input className="cs-field mt-1" required minLength={5} value={pax.phone} onChange={set("phone")} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button disabled={loading === "trip"} className="btn-primary rounded-xl px-6 py-2.5 text-sm font-bold disabled:opacity-60">{loading === "trip" ? "Preparing…" : "See price breakdown"}</button>
              <button type="button" onClick={() => setChosen(null)} className="text-sm text-mut underline">Choose another flight</button>
            </div>
          </Card>
        </form>
      )}

      {trip && (
        <div className="cs-rise grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <Card>
            <Eyebrow>Price breakdown · {trip.id}</Eyebrow>
            <h2 className="mt-1 text-2xl font-extrabold">{trip.airline} {trip.origin} → {trip.destination}</h2>
            <p className="text-sm text-mut">{trip.departureDate}</p>
            <div className="mt-4">
              <Row k={trip.priceLabel ?? "Fare (provider quote)"} v={<Money amount={trip.basePrice} currency={trip.currency} />} />
              <Row k="ClearSend service fee (3%)" v={<Money amount={trip.serviceFee} currency={trip.currency} />} />
              <Row strong k="You pay" v={<Money amount={trip.totalPrice} currency={trip.currency} className="text-2xl" />} />
            </div>
          </Card>
          <Card>
            <Eyebrow>Step 3 · Your explicit yes</Eyebrow>
            <h3 className="mt-1 text-xl font-extrabold">Would you like me to book this and pay with your PayPal account?</h3>
            <p className="mt-1 text-sm text-mut">Type your answer, e.g. “yes, book it”. No PayPal order exists until you confirm.</p>
            <div className="mt-4 space-y-3">
              <input className="cs-field" aria-label="Your answer" placeholder="yes, book it" value={conf} onChange={(e) => setConf(e.target.value)} />
              <button onClick={pay} disabled={loading === "pay" || !YES.test(conf)} className="btn-paypal flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold disabled:opacity-50">
                {loading === "pay" ? "Creating order…" : <>Pay <Money amount={trip.totalPrice} currency={trip.currency} /> with PayPal (sandbox)</>}
              </button>
              <p className="text-xs text-mut">After you approve in PayPal you return to ClearSend and type CAPTURE to take the payment.</p>
              <SandboxNote />
              <SandboxHelp compact />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

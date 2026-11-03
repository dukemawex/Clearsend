// Live market fares from Google Flights, read in a Kernel (onkernel.com) stealth cloud browser over CDP.
// Prices are real and shown as "Live market price (Google Flights)". ClearSend does not buy these tickets:
// bookings are test bookings via the Duffel sandbox (see lib/duffel-booking.ts).
import { openrouterModelIds, OPENROUTER_DEFAULT_BASE_URL } from "./ai-models";

export type KernelFare = {
  id: string; provider: "kernel"; airline: string; route: string; origin: string; destination: string;
  depart: string; arrive: string; stops: number; duration?: string; price: number; currency: string;
  source: "google_flights"; priceLabel: string; evidence?: KernelEvidence;
};
export type KernelEvidence = { sessionId?: string; liveViewUrl?: string; replayUrl?: string; searchUrl: string; fetchedAt: number; parser: "dom" | "ai" };
export type KernelSearchInput = { origin: string; destination: string; date: string; passengers?: number; currency?: string };
export type KernelResult = { offers: KernelFare[]; status: "success" | "empty" | "error"; message?: string; evidence?: KernelEvidence; elapsedMs?: number; cached?: boolean };

export const KERNEL_TIMEOUT_MS = 45_000;
export const KERNEL_CACHE_TTL_SEC = 15 * 60;
export const KERNEL_PRICE_LABEL = "Live market price (Google Flights)";

type Env = Record<string, string | undefined>;
export function kernelStatus(env: Env = process.env): { enabled: boolean; reason?: string } {
  if (!env.KERNEL_API_KEY?.trim()) return { enabled: false, reason: "Kernel is not configured: set KERNEL_API_KEY (and ENABLE_KERNEL_FALLBACK=true) to read live Google Flights prices." };
  if (env.ENABLE_KERNEL_FALLBACK !== "true") return { enabled: false, reason: "Kernel live prices are switched off: set ENABLE_KERNEL_FALLBACK=true." };
  return { enabled: true };
}
/** KERNEL_API_URL is the SDK base URL (default https://api.onkernel.com/). An old session-endpoint value is ignored. */
export function kernelBaseUrl(env: Env = process.env): string | undefined {
  const u = env.KERNEL_API_URL?.trim();
  if (!u || /\/v1\/browser\/sessions/.test(u)) return undefined;
  return u;
}

export function googleFlightsUrl(i: KernelSearchInput): string {
  const pax = Math.max(1, Math.min(9, i.passengers ?? 1));
  const q = `Flights to ${i.destination} from ${i.origin} on ${i.date} one way ${pax} adult${pax > 1 ? "s" : ""} economy`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${encodeURIComponent(i.currency ?? "USD")}&hl=en&gl=US`;
}

const CUR_WORDS: Record<string, string> = { "us dollars": "USD", "us dollar": "USD", euros: "EUR", euro: "EUR", "british pounds": "GBP", "british pound": "GBP", "nigerian nairas": "NGN", "nigerian naira": "NGN" };

/** Parse Google Flights result rows by their accessible labels, e.g.
 * "From 812 US dollars. 1 stop flight with Royal Air Maroc. Leaves Murtala Muhammed International Airport at 11:55 PM on Monday, December 1 and arrives at Heathrow Airport at 9:05 AM on Tuesday, December 2. Total duration 11 hr 10 min." */
export function parseGoogleFlightsLabels(labels: string[], i: KernelSearchInput): KernelFare[] {
  const out: KernelFare[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const s = raw.replace(/\s+/g, " ").trim();
    const p = /From ([\d,]+(?:\.\d+)?) ([A-Za-z ]+?)\./.exec(s);
    const w = /(Nonstop|(\d+) stops?) flight with ([^.]+?)\./i.exec(s);
    if (!p || !w) continue;
    const price = Number(p[1].replace(/,/g, ""));
    const currency = CUR_WORDS[p[2].trim().toLowerCase()] ?? (i.currency ?? "USD");
    if (!(price > 0)) continue;
    const leaves = /Leaves .*? at ([\d:]+\s?[AP]M)/i.exec(s)?.[1] ?? "";
    const arrives = /arrives at .*? at ([\d:]+\s?[AP]M)/i.exec(s)?.[1] ?? "";
    const duration = /Total duration ([^.]+)\./i.exec(s)?.[1];
    const stops = /nonstop/i.test(w[1]) ? 0 : Number(w[2]);
    const airline = w[3].replace(/\s+and\s+/g, ", ").trim();
    const key = `${airline}|${leaves}|${arrives}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fare(i, { airline, price, currency, stops, duration, depart: leaves, arrive: arrives }, out.length));
  }
  return out;
}

function fare(i: KernelSearchInput, f: { airline: string; price: number; currency: string; stops: number; duration?: string; depart: string; arrive: string }, n: number): KernelFare {
  return { id: `kernel-${i.origin}-${i.destination}-${i.date}-${n}`, provider: "kernel", source: "google_flights", priceLabel: KERNEL_PRICE_LABEL, route: `${i.origin}-${i.destination}`, origin: i.origin, destination: i.destination,
    airline: f.airline, price: f.price, currency: f.currency, stops: f.stops, duration: f.duration,
    depart: f.depart ? `${i.date} ${f.depart}` : i.date, arrive: f.arrive };
}

/** Backup parser: a free OpenRouter model reads the visible page text. Every price it returns must appear in that text. */
export async function aiParseFares(text: string, i: KernelSearchInput, fetchImpl: typeof fetch = fetch, env: Env = process.env): Promise<KernelFare[]> {
  const key = env.OPENROUTER_API_KEY;
  if (!key || !text.trim()) return [];
  const prompt = `Extract up to 10 one-way flight results from this Google Flights page text for ${i.origin}→${i.destination} on ${i.date}. Reply ONLY with JSON: {"fares":[{"airline":string,"price":number,"currency":"USD","stops":number,"duration":string,"depart":"h:mm AM","arrive":"h:mm PM"}]}. Use only numbers that appear in the text; if none, return {"fares":[]}.\n\n${text.slice(0, 12000)}`;
  for (const model of openrouterModelIds(env)) {
    try {
      const r = await fetchImpl(`${env.OPENROUTER_BASE_URL || OPENROUTER_DEFAULT_BASE_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
      if (!r.ok) continue;
      const j = await r.json() as { choices?: { message?: { content?: string } }[] };
      const m = /\{[\s\S]*\}/.exec(j.choices?.[0]?.message?.content ?? "");
      if (!m) continue;
      const fares = (JSON.parse(m[0]).fares ?? []) as Array<Record<string, unknown>>;
      const plain = text.replace(/,/g, "");
      const ok = fares.filter((f) => typeof f.price === "number" && f.price > 0 && typeof f.airline === "string" && plain.includes(String(f.price)));
      return ok.map((f, n) => fare(i, { airline: String(f.airline), price: Number(f.price), currency: typeof f.currency === "string" ? f.currency : (i.currency ?? "USD"), stops: Number(f.stops) || 0, duration: typeof f.duration === "string" ? f.duration : undefined, depart: String(f.depart ?? ""), arrive: String(f.arrive ?? "") }, n));
    } catch { /* try next model */ }
  }
  return [];
}

// ---------- browser driver (injectable for tests) ----------
export type KernelBrowser = { session_id: string; cdp_ws_url: string; browser_live_view_url?: string };
export type KernelClientLike = {
  browsers: {
    create(p: Record<string, unknown>): Promise<KernelBrowser>;
    deleteByID(id: string): Promise<unknown>;
    replays?: { start(id: string): Promise<{ replay_id: string; replay_view_url?: string }>; stop(replayId: string, p: { id: string }): Promise<unknown> };
  };
};
export type PageReader = (cdpUrl: string, url: string, signal: AbortSignal) => Promise<{ labels: string[]; text: string; blocked?: string }>;
export type CacheLike = { get(k: string): Promise<string | null>; set(k: string, v: string, ttlSec: number): Promise<void> };
export type KernelDeps = { client?: KernelClientLike; readPage?: PageReader; cache?: CacheLike | null; aiParse?: typeof aiParseFares; env?: Env; now?: () => number; timeoutMs?: number };

/** Default page reader: Playwright connectOverCDP to the Kernel browser, load Google Flights, read result-row labels. */
export const playwrightReader: PageReader = async (cdpUrl, url, signal) => {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const ctx = browser.contexts()[0] ?? await browser.newContext();
    const page = ctx.pages()[0] ?? await ctx.newPage();
    signal.addEventListener("abort", () => { page.close().catch(() => {}); });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // EU consent wall
    const consent = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
    if (await consent.isVisible({ timeout: 2000 }).catch(() => false)) await consent.click().catch(() => {});
    await page.waitForSelector('li [aria-label^="From "], [role="listitem"] [aria-label^="From "]', { timeout: 20_000 }).catch(() => {});
    const labels = await page.$$eval('[aria-label^="From "]', (els) => els.map((e) => e.getAttribute("aria-label") ?? "")).catch(() => [] as string[]);
    const text = labels.length ? "" : (await page.innerText("body").catch(() => "")).slice(0, 20000);
    const lower = text.toLowerCase();
    const blocked = /unusual traffic|not a robot|captcha/.test(lower) ? (text.match(/[^\n]*(unusual traffic|not a robot|captcha)[^\n]*/i)?.[0] ?? "captcha") : undefined;
    return { labels, text, blocked };
  } finally { await browser.close().catch(() => {}); }
};

export function upstashCache(env: Env = process.env): CacheLike | null {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const cmd = async (c: string[]) => { const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(c), cache: "no-store" }); if (!r.ok) throw new Error(`Upstash ${r.status}`); return (await r.json() as { result: unknown }).result; };
  return { get: async (k) => (await cmd(["GET", k])) as string | null, set: async (k, v, ttl) => { await cmd(["SET", k, v, "EX", String(ttl)]); } };
}

async function defaultClient(env: Env): Promise<KernelClientLike> {
  const { default: Kernel } = await import("@onkernel/sdk");
  return new Kernel({ apiKey: env.KERNEL_API_KEY!, ...(kernelBaseUrl(env) ? { baseURL: kernelBaseUrl(env) } : {}) }) as unknown as KernelClientLike;
}

export async function searchKernelFares(i: KernelSearchInput, deps: KernelDeps = {}): Promise<KernelResult> {
  const env = deps.env ?? process.env;
  const st = kernelStatus(env);
  if (!st.enabled) return { offers: [], status: "error", message: st.reason };
  const now = deps.now ?? Date.now;
  const cache = deps.cache === undefined ? upstashCache(env) : deps.cache;
  const ck = `kernelfares:${i.origin}:${i.destination}:${i.date}:${i.passengers ?? 1}:${i.currency ?? "USD"}`;
  if (cache) { try { const hit = await cache.get(ck); if (hit) return { ...(JSON.parse(hit) as KernelResult), cached: true }; } catch { /* cache is best-effort */ } }

  const started = now();
  const searchUrl = googleFlightsUrl(i);
  let client: KernelClientLike;
  try { client = deps.client ?? await defaultClient(env); } catch (e) { return { offers: [], status: "error", message: `Kernel SDK unavailable: ${(e as Error).message}` }; }
  let b: KernelBrowser | null = null;
  const ctl = new AbortController();
  const timeoutMs = deps.timeoutMs ?? KERNEL_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    b = await client.browsers.create({ stealth: true, headless: false, timeout_seconds: 120 });
    let replay: { replay_id: string; replay_view_url?: string } | undefined;
    try { replay = await client.browsers.replays?.start(b.session_id); } catch { /* replays need a paid plan */ }
    const evidence: KernelEvidence = { sessionId: b.session_id, liveViewUrl: b.browser_live_view_url, replayUrl: replay?.replay_view_url, searchUrl, fetchedAt: now(), parser: "dom" };
    const read = await Promise.race([
      (deps.readPage ?? playwrightReader)(b.cdp_ws_url, searchUrl, ctl.signal),
      new Promise<never>((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error(`Kernel search timed out after ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs); }),
    ]);
    if (replay) { try { await client.browsers.replays?.stop(replay.replay_id, { id: b.session_id }); } catch { /* best effort */ } }
    let offers = parseGoogleFlightsLabels(read.labels, i);
    if (!offers.length && read.text) { offers = await (deps.aiParse ?? aiParseFares)(read.text, i, fetch, env); if (offers.length) evidence.parser = "ai"; }
    offers = offers.map((o) => ({ ...o, evidence })).sort((a, b) => a.price - b.price);
    const elapsedMs = now() - started;
    if (!offers.length) return { offers, status: read.blocked ? "error" : "empty", message: read.blocked ? `Google Flights blocked the Kernel browser: "${read.blocked.slice(0, 200)}"` : "Google Flights page loaded but no priced results were found.", evidence, elapsedMs };
    const res: KernelResult = { offers, status: "success", evidence, elapsedMs };
    if (cache) { try { await cache.set(ck, JSON.stringify(res), KERNEL_CACHE_TTL_SEC); } catch { /* ignore */ } }
    return res;
  } catch (e) {
    return { offers: [], status: "error", message: `Kernel: ${(e as Error).message}`, elapsedMs: now() - started };
  } finally {
    if (timer) clearTimeout(timer);
    if (b) { try { await client.browsers.deleteByID(b.session_id); } catch { /* session times out anyway */ } }
  }
}

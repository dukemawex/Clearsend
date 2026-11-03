import { test } from "node:test";
import assert from "node:assert/strict";
// Stubbed Kernel client + page reader: no network.
import { googleFlightsUrl, kernelStatus, kernelBaseUrl, parseGoogleFlightsLabels, searchKernelFares, KERNEL_PRICE_LABEL, type KernelClientLike } from "../lib/kernel-flights";

const I = { origin: "LOS", destination: "LHR", date: "2026-12-01" };
const ENV = { KERNEL_API_KEY: "k", ENABLE_KERNEL_FALLBACK: "true" };
const LABELS = [
  "From 812 US dollars. 1 stop flight with Royal Air Maroc. Leaves Murtala Muhammed International Airport at 11:55 PM on Tuesday, December 1 and arrives at Heathrow Airport at 9:05 AM on Wednesday, December 2. Total duration 10 hr 10 min. Layover (1 of 1) is a 2 hr layover at Mohammed V International Airport in Casablanca.",
  "From 1,204 US dollars. Nonstop flight with British Airways. Leaves Murtala Muhammed International Airport at 10:30 PM on Tuesday, December 1 and arrives at Heathrow Airport at 5:00 AM on Wednesday, December 2. Total duration 6 hr 30 min.",
  "Some unrelated label",
];

function client(log: string[]): KernelClientLike {
  return { browsers: {
    create: async () => { log.push("create"); return { session_id: "s1", cdp_ws_url: "wss://x", browser_live_view_url: "https://live/s1" }; },
    deleteByID: async (id) => { log.push(`delete:${id}`); },
    replays: { start: async () => ({ replay_id: "r1", replay_view_url: "https://replay/r1" }), stop: async () => { log.push("stop"); } },
  } };
}

test("status: disabled without key or flag, with a clear provider error", () => {
  assert.match(kernelStatus({}).reason!, /KERNEL_API_KEY/);
  assert.match(kernelStatus({ KERNEL_API_KEY: "k" }).reason!, /ENABLE_KERNEL_FALLBACK=true/);
  assert.equal(kernelStatus(ENV).enabled, true);
  assert.equal(kernelBaseUrl({ KERNEL_API_URL: "https://api.onkernel.com/v1/browser/sessions" }), undefined);
});

test("search URL encodes route, date, passengers", () => {
  const u = googleFlightsUrl({ ...I, passengers: 2 });
  assert.match(decodeURIComponent(u), /Flights to LHR from LOS on 2026-12-01 one way 2 adults/);
});

test("parses Google Flights result labels into priced fares", () => {
  const f = parseGoogleFlightsLabels(LABELS, I);
  assert.equal(f.length, 2);
  assert.deepEqual([f[0].airline, f[0].price, f[0].stops, f[0].currency, f[0].duration], ["Royal Air Maroc", 812, 1, "USD", "10 hr 10 min"]);
  assert.equal(f[1].price, 1204); assert.equal(f[1].stops, 0);
  assert.equal(f[0].priceLabel, KERNEL_PRICE_LABEL);
});

test("disabled search returns provider error without touching Kernel", async () => {
  const r = await searchKernelFares(I, { env: {}, cache: null });
  assert.equal(r.status, "error"); assert.match(r.message!, /KERNEL_API_KEY/);
});

test("live path: fares sorted, evidence kept, browser always deleted, result cached", async () => {
  const log: string[] = []; const store = new Map<string, string>();
  const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: string) => { store.set(k, v); } };
  const r = await searchKernelFares(I, { env: ENV, client: client(log), cache, readPage: async () => ({ labels: LABELS, text: "" }) });
  assert.equal(r.status, "success");
  assert.deepEqual(r.offers.map((o) => o.price), [812, 1204]);
  assert.equal(r.evidence?.replayUrl, "https://replay/r1");
  assert.ok(log.includes("delete:s1"));
  const again = await searchKernelFares(I, { env: ENV, client: client([]), cache, readPage: async () => { throw new Error("should be cached"); } });
  assert.equal(again.cached, true); assert.equal(again.offers.length, 2);
});

test("timeout and errors still close the browser", async () => {
  const log: string[] = [];
  const r = await searchKernelFares(I, { env: ENV, client: client(log), cache: null, timeoutMs: 20, readPage: () => new Promise(() => {}) });
  assert.equal(r.status, "error"); assert.match(r.message!, /timed out/);
  assert.ok(log.includes("delete:s1"));
});

test("captcha/block page is reported verbatim, AI backup parser only used on page text", async () => {
  const r = await searchKernelFares(I, { env: ENV, client: client([]), cache: null, aiParse: async () => [], readPage: async () => ({ labels: [], text: "Our systems have detected unusual traffic from your computer network.", blocked: "Our systems have detected unusual traffic from your computer network." }) });
  assert.equal(r.status, "error"); assert.match(r.message!, /unusual traffic/);
});

// Small Upstash REST client for the chat bots. Every key lives under clearsend:chat:.
// Falls back to an in-memory map only outside production (same rule as lib/escrow.ts).

export const CHAT_PREFIX = "clearsend:chat:";

type Cmd = Array<string | number>;
const mem = new Map<string, { v: string | string[]; exp?: number }>();

function live(k: string) {
  const e = mem.get(k);
  if (e && e.exp && e.exp < Date.now()) { mem.delete(k); return undefined; }
  return e;
}

async function memExec(cmd: Cmd): Promise<unknown> {
  const [op, key, ...rest] = cmd.map(String);
  const name = op.toUpperCase();
  if (name === "GET") { const e = live(key); return typeof e?.v === "string" ? e.v : null; }
  if (name === "SET") {
    const nx = rest.includes("NX");
    const exIdx = rest.indexOf("EX");
    if (nx && live(key)) return null;
    mem.set(key, { v: rest[0], exp: exIdx >= 0 ? Date.now() + Number(rest[exIdx + 1]) * 1000 : undefined });
    return "OK";
  }
  if (name === "DEL") { const had = mem.delete(key); return had ? 1 : 0; }
  if (name === "INCR") { const e = live(key); const n = Number(e?.v ?? 0) + 1; mem.set(key, { v: String(n), exp: e?.exp }); return n; }
  if (name === "EXPIRE") { const e = live(key); if (e) e.exp = Date.now() + Number(rest[0]) * 1000; return e ? 1 : 0; }
  if (name === "LPUSH") { const e = live(key); const arr = Array.isArray(e?.v) ? e!.v as string[] : []; arr.unshift(...rest); mem.set(key, { v: arr }); return arr.length; }
  if (name === "LTRIM") { const e = live(key); if (Array.isArray(e?.v)) e!.v = (e!.v as string[]).slice(Number(rest[0]), Number(rest[1]) + 1); return "OK"; }
  if (name === "LRANGE") { const e = live(key); return Array.isArray(e?.v) ? (e!.v as string[]).slice(Number(rest[0]), Number(rest[1]) === -1 ? undefined : Number(rest[1]) + 1) : []; }
  throw new Error(`memory store: unsupported ${name}`);
}

export async function redis(cmd: Cmd): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") throw new Error("Chat bot storage not configured (UPSTASH_REDIS_REST_URL/TOKEN).");
    return memExec(cmd);
  }
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmd.map(String)), cache: "no-store" });
  if (!res.ok) throw new Error(`Upstash ${String(cmd[0])} failed: ${res.status}`);
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

export const k = (...parts: Array<string | number>) => CHAT_PREFIX + parts.join(":");

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await redis(["GET", key]);
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
export async function setJSON(key: string, value: unknown, ttlSeconds?: number) {
  await redis(ttlSeconds ? ["SET", key, JSON.stringify(value), "EX", ttlSeconds] : ["SET", key, JSON.stringify(value)]);
}
export async function del(key: string) { await redis(["DEL", key]); }

/** Returns true the first time a key is seen within ttl (used for idempotency). */
export async function once(key: string, ttlSeconds = 3600): Promise<boolean> {
  return (await redis(["SET", key, "1", "NX", "EX", ttlSeconds])) === "OK";
}

/** Fixed-window rate limit. Returns true when allowed. */
export async function rateLimit(id: string, limit = 20, windowSeconds = 60): Promise<boolean> {
  const key = k("rl", id, Math.floor(Date.now() / 1000 / windowSeconds));
  const n = Number(await redis(["INCR", key]));
  if (n === 1) await redis(["EXPIRE", key, windowSeconds]);
  return n <= limit;
}

export type ChatActivity = { at: number; platform: string; chatId: string; userId: string; action: string; escrowId?: string; ok: boolean; note?: string };
export async function logActivity(entry: Omit<ChatActivity, "at">) {
  try {
    await redis(["LPUSH", k("activity"), JSON.stringify({ at: Date.now(), ...entry })]);
    await redis(["LTRIM", k("activity"), 0, 499]);
  } catch (e) {
    console.warn("chat_activity_log_failed", { error: e instanceof Error ? e.message : "unknown" });
  }
}
export async function recentActivity(limit = 50): Promise<ChatActivity[]> {
  const rows = (await redis(["LRANGE", k("activity"), 0, limit - 1])) as string[];
  return (rows ?? []).map((r) => { try { return JSON.parse(r) as ChatActivity; } catch { return null; } }).filter((x): x is ChatActivity => !!x);
}

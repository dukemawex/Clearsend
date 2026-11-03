// Append-only activity log in Upstash Redis (sorted set index + JSON values).
// Real records only: entries are written when the agent, a web user or a chat bot actually does something.
import { timingSafeEqual } from "crypto";

export type ActivityKind = "paypal" | "decision" | "confirmation" | "escrow" | "trip" | "flight-search" | "chat" | "status" | "system";
export type Activity = { id: string; at: string; kind: ActivityKind; subject: string; actor: string; summary: string; data?: Record<string, unknown> };

const INDEX = "cs-activity:index";
const key = (id: string) => `cs-activity:${id}`;

export class ActivityStoreError extends Error {}

export function activityConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new ActivityStoreError("Activity storage is not configured (UPSTASH_REDIS_REST_URL/TOKEN).");
  const res = await fetch(url.replace(/\/$/, ""), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(command.map(String)), cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new ActivityStoreError(`Upstash ${command[0]} failed: ${body.error ?? res.status}`);
  return body.result as T;
}

function newId() {
  const rand = crypto.getRandomValues(new Uint8Array(5));
  return `act_${Date.now().toString(36)}${Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Best effort: logging must never break a money flow. Returns null when storage is missing or fails. */
export async function recordActivity(a: Omit<Activity, "id" | "at">): Promise<Activity | null> {
  if (!activityConfigured()) return null;
  const item: Activity = { id: newId(), at: new Date().toISOString(), ...a, summary: a.summary.slice(0, 500) };
  try {
    await redis("SET", key(item.id), JSON.stringify(item));
    await redis("ZADD", INDEX, Date.now(), item.id);
    return item;
  } catch (e) {
    console.warn("activity_record_failed", (e as Error).message);
    return null;
  }
}

export async function listActivity(limit = 100, filter: { subject?: string; kind?: string; q?: string } = {}): Promise<Activity[]> {
  const scan = filter.subject || filter.kind || filter.q ? 500 : limit;
  const ids = await redis<string[]>("ZREVRANGE", INDEX, 0, scan - 1);
  if (!ids?.length) return [];
  const raws = await redis<(string | null)[]>("MGET", ...ids.map(key));
  const q = filter.q?.toLowerCase();
  return raws
    .filter((r): r is string => Boolean(r))
    .map((r) => JSON.parse(r) as Activity)
    .filter((a) => (!filter.subject || a.subject === filter.subject) && (!filter.kind || a.kind === filter.kind) && (!q || `${a.summary} ${a.actor} ${a.subject}`.toLowerCase().includes(q)))
    .slice(0, limit);
}

export async function deleteActivity(filter: { id?: string; subject?: string }) {
  const all = await listActivity(1000);
  const hit = all.filter((a) => (filter.id && a.id === filter.id) || (filter.subject && a.subject === filter.subject));
  for (const a of hit) {
    await redis("DEL", key(a.id));
    await redis("ZREM", INDEX, a.id);
  }
  return hit.length;
}

export function hasServiceKey(req: Request) {
  const expected = process.env.CLEAR_SEND_API_KEY;
  const got = req.headers.get("x-clearsend-api-key");
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Per-visitor privacy without sign-up. Each browser gets a random 128-bit anonymous owner id in an
// httpOnly cookie (set by middleware.ts). Records created from the web or agent chat are stamped with it;
// list endpoints only return the caller's own records plus escrows they opened via a role link.
// Telegram records are owned by "tg:<chatId>" and MCP calls by "mcp:*", which can never equal a cookie id.
import { AsyncLocalStorage } from "node:async_hooks";

export const OWNER_COOKIE = "cs_uid";
export const OWNER_HEADER = "x-cs-uid";
const als = new AsyncLocalStorage<string | null>();

export function isWebOwnerId(v: unknown): v is string { return typeof v === "string" && /^[a-f0-9]{32}$/.test(v); }

export function newOwnerId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Run fn with an explicit owner (agent streams, MCP, Telegram, tests). */
export function runAsOwner<T>(owner: string | null, fn: () => T): T { return als.run(owner, fn); }

/** The owner for the current request: explicit context first, then the middleware-injected header / cookie. */
export async function currentOwner(): Promise<string | null> {
  const s = als.getStore();
  if (s !== undefined) return s;
  try {
    const { headers, cookies } = await import("next/headers");
    const h = (await headers()).get(OWNER_HEADER);
    if (isWebOwnerId(h)) return h;
    const c = (await cookies()).get(OWNER_COOKIE)?.value;
    if (isWebOwnerId(c)) return c;
  } catch { /* outside a request */ }
  return null;
}

/** Owner from a raw Request (route handlers), without next/headers. */
export function ownerFromRequest(req: Request): string | null {
  const h = req.headers.get(OWNER_HEADER);
  if (isWebOwnerId(h)) return h;
  const m = /(?:^|;\s*)cs_uid=([a-f0-9]{32})(?:;|$)/.exec(req.headers.get("cookie") ?? "");
  return m ? m[1] : null;
}

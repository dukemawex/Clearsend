import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { verifyEscrowToken, type EscrowRole } from "./escrow-links";
import { ownerFromRequest } from "./owner";
import type { EscrowRecord } from "./escrow";

/** Who may call each per-escrow action (kept consistent with the Telegram rules in lib/chatbots/parse.ts and the README).
 * Release: payer only. Refund: payer or verifier. Submit: recipient. Verify: verifier. Fund: payer. */
export const ACTION_ROLES = {
  fund: ["payer"],
  submit: ["recipient"],
  verify: ["verifier"],
  release: ["payer"],
  refund: ["payer", "verifier"],
} as const satisfies Record<string, readonly EscrowRole[]>;
export type EscrowAction = keyof typeof ACTION_ROLES;

const ROLES: EscrowRole[] = ["payer", "recipient", "verifier"];

export function hasServiceKey(req: Request): boolean {
  const key = req.headers.get("x-clearsend-api-key"), want = process.env.CLEAR_SEND_API_KEY;
  if (!key || !want) return false;
  const a = Buffer.from(key), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AuthResult = { ok: true; role: EscrowRole | "service"; via: "service" | "token" | "creator" } | { ok: false; res: NextResponse };

/**
 * 401 when no credential at all, 403 when a token is invalid or for a role not allowed to do this.
 * The escrow creator's browser (cs_uid cookie == escrow.ownerId) counts as the payer, since the creator is the payer.
 */
export function authorizeEscrow(req: Request, escrow: Pick<EscrowRecord, "id" | "ownerId"> | { id: string; ownerId?: string }, action: EscrowAction, cred: { role?: string | null; token?: string | null }): AuthResult {
  if (hasServiceKey(req)) return { ok: true, role: "service", via: "service" };
  const allowed = ACTION_ROLES[action] as readonly EscrowRole[];
  const { role, token } = cred;
  if (role && token) {
    if (!ROLES.includes(role as EscrowRole) || !verifyEscrowToken(escrow.id, role as EscrowRole, token)) return { ok: false, res: NextResponse.json({ error: "Invalid token for this role" }, { status: 403 }) };
    if (!allowed.includes(role as EscrowRole)) return { ok: false, res: NextResponse.json({ error: `Only the ${allowed.join(" or ")} can ${action} this escrow` }, { status: 403 }) };
    return { ok: true, role: role as EscrowRole, via: "token" };
  }
  const owner = ownerFromRequest(req);
  if (allowed.includes("payer") && owner && escrow.ownerId && owner === escrow.ownerId) return { ok: true, role: "payer", via: "creator" };
  return { ok: false, res: NextResponse.json({ error: "Missing role or token" }, { status: 401 }) };
}

/** Exact typed phrase the server requires for money-out actions, e.g. "RELEASE 5.00 USD". */
export function requiredConfirmation(action: "release" | "refund", amount: number, currency: string) {
  return `${action.toUpperCase()} ${amount.toFixed(2)} ${currency.toUpperCase()}`;
}
export function confirmationMatches(typed: unknown, expected: string) {
  return typeof typed === "string" && typed.trim().replace(/\s+/g, " ").toUpperCase() === expected.toUpperCase();
}

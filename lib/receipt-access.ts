import { getEscrow } from "./escrow";
import { getTrip } from "./trips";
import { verifyEscrowToken, type EscrowRole } from "./escrow-links";
import { parseReceiptId, type Receipt } from "./receipts";

const ROLES = ["payer", "recipient", "verifier"] as const;

export type ReceiptAccess = { status: 200; receipt: Receipt } | { status: 400 | 401 | 403 | 404; error: string };

/** Same rules as the escrow routes: service key, or a valid HMAC role token for the escrow/trip. Trips accept the payer token only. */
export async function loadReceipt(id: string, opts: { role?: string | null; token?: string | null; serviceKey?: string | null }): Promise<ReceiptAccess> {
  const parsed = parseReceiptId(id);
  if (!parsed) return { status: 404, error: "Receipt not found" };
  const hasKey = !!opts.serviceKey && !!process.env.CLEAR_SEND_API_KEY && opts.serviceKey === process.env.CLEAR_SEND_API_KEY;
  if (!hasKey) {
    if (!opts.role || !opts.token) return { status: 401, error: "Missing role or token" };
    const allowed = parsed.subjectType === "trip" ? ["payer"] : ROLES;
    if (!allowed.includes(opts.role as EscrowRole) || !verifyEscrowToken(parsed.subjectId, opts.role as EscrowRole, opts.token)) return { status: 403, error: "Invalid token for this role" };
  }
  const rec = parsed.subjectType === "escrow" ? await getEscrow(parsed.subjectId) : await getTrip(parsed.subjectId);
  const receipt = rec?.receipts?.find((r) => r.id === id);
  if (!receipt) return { status: 404, error: "Receipt not found" };
  return { status: 200, receipt };
}

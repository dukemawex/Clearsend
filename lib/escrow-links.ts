import { createHmac } from "crypto";

function getSecret(): string {
  const secret = process.env.ESCROW_LINK_SECRET;
  if (!secret) {
    console.warn("ESCROW_LINK_SECRET not set, using fallback (NOT SECURE FOR PRODUCTION)");
    return "fallback-secret-do-not-use-in-production";
  }
  return secret;
}

export type EscrowRole = "payer" | "recipient" | "verifier";

export function signEscrowToken(escrowId: string, role: EscrowRole): string {
  const payload = `${escrowId}:${role}`;
  const hmac = createHmac("sha256", getSecret());
  hmac.update(payload);
  return hmac.digest("hex");
}

export function verifyEscrowToken(escrowId: string, role: EscrowRole, token: string): boolean {
  const expected = signEscrowToken(escrowId, role);
  return token === expected;
}

export function createEscrowLink(escrowId: string, role: EscrowRole, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const token = signEscrowToken(escrowId, role);
  return `${base}/escrow/${escrowId}?role=${role}&token=${token}`;
}

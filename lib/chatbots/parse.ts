// Pure parsing helpers for chat commands (no I/O, unit tested in tests/chatbots.test.ts).

export type ParsedCommand = { cmd: string; args: string };

/** "/escrow@ClearSendBot 100 USD to Ada for logo" -> { cmd: "escrow", args: "100 USD to Ada for logo" } */
export function parseCommand(text: string, botUsername?: string): ParsedCommand | null {
  const m = /^\/([a-z_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  if (m[2] && botUsername && m[2].toLowerCase() !== botUsername.toLowerCase()) return null; // addressed to another bot
  return { cmd: m[1].toLowerCase(), args: (m[3] ?? "").trim() };
}

const CUR = /^[A-Za-z]{3}$/;

export type InlineEscrow = { amount: number; currency: string; recipient: string; recipientEmail?: string; specification: string };

/** "100 USD to Ada Obi <ada@example.com> for a 3-page logo brief" */
export function parseInlineEscrow(args: string): InlineEscrow | null {
  const m = /^(\d+(?:[.,]\d{1,2})?)\s+([A-Za-z]{3})\s+to\s+(.+?)\s+for\s+([\s\S]{3,})$/i.exec(args.trim());
  if (!m) return null;
  const amount = Number(m[1].replace(",", "."));
  if (!(amount > 0) || amount > 100000) return null;
  let recipient = m[3].trim();
  let recipientEmail: string | undefined;
  const em = /<?([^\s<>]+@[^\s<>]+\.[^\s<>]+)>?/.exec(recipient);
  if (em) { recipientEmail = em[1].toLowerCase(); recipient = recipient.replace(em[0], "").trim() || recipientEmail; }
  return { amount: Math.round(amount * 100) / 100, currency: m[2].toUpperCase(), recipient: recipient.slice(0, 80), recipientEmail, specification: m[4].trim().slice(0, 2000) };
}

/** "100 USD NGN" or "100 USD to NGN" */
export function parseQuote(args: string): { amount: number; from: string; to: string } | null {
  const parts = args.trim().split(/\s+/).filter((p) => p.toLowerCase() !== "to");
  if (parts.length !== 3) return null;
  const amount = Number(parts[0].replace(",", "."));
  if (!(amount > 0) || amount > 1_000_000 || !CUR.test(parts[1]) || !CUR.test(parts[2])) return null;
  return { amount, from: parts[1].toUpperCase(), to: parts[2].toUpperCase() };
}

export type Role = "payer" | "recipient" | "verifier";
export const ROLES: Role[] = ["payer", "recipient", "verifier"];

/** Extract escrow id / role / token from a ClearSend role link. */
export function parseRoleLink(text: string): { escrowId: string; role: Role; token: string } | null {
  try {
    const url = new URL(text.trim());
    const m = /\/escrow\/(escrow_[A-Za-z0-9_]+)$/.exec(url.pathname);
    const role = url.searchParams.get("role") as Role | null;
    const token = url.searchParams.get("token");
    if (!m || !role || !ROLES.includes(role) || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return { escrowId: m[1], role, token };
  } catch { return null; }
}

export const isEscrowId = (s: string) => /^escrow_\d+_[a-z0-9]+$/.test(s);
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
export const isInviteCode = (s: string) => /^[A-Za-z0-9_-]{16,40}$/.test(s);

/** Exact words a payer must type before money moves (mirrors the web app's typed confirmations). */
export function confirmPhrase(action: "release" | "refund", amount: number, currency: string) {
  return `${action.toUpperCase()} ${amount.toFixed(2)} ${currency.toUpperCase()}`;
}
export function phraseMatches(typed: string, expected: string) {
  return typed.trim().replace(/\s+/g, " ").toUpperCase() === expected.toUpperCase();
}

/** Who may do what. Release only by payer, only after AI verification. */
export function roleAllowed(action: string, role: Role | null): boolean {
  if (!role) return false;
  switch (action) {
    case "fund": case "capture": case "release": case "invite": return role === "payer";
    case "submit": return role === "recipient";
    case "refund": return role === "payer" || role === "verifier";
    case "verify": case "status": return true;
    default: return false;
  }
}

export function quoteBreakdown(amount: number, rate: number, from?: string, to?: string) {
  const fee = amount * 0.025;
  const same = !!from && !!to && from.toUpperCase() === to.toUpperCase();
  const spreadPercent = same ? 0 : 1.2;
  const customerRate = same ? 1 : rate * (1 - spreadPercent / 100);
  return { fee: Math.round(fee * 100) / 100, customerRate, spreadPercent, receive: Math.round((amount - fee) * customerRate * 100) / 100 };
}

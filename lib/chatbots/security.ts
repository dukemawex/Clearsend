import { timingSafeEqual } from "crypto";

/** Telegram webhook secret header check (constant time). */
export function verifyTelegramSecret(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

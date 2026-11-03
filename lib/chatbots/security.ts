import { createPublicKey, timingSafeEqual, verify } from "crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Discord interaction signature: Ed25519 over timestamp + raw body. */
export function verifyDiscordSignature(publicKeyHex: string | undefined, signatureHex: string | null, timestamp: string | null, rawBody: string): boolean {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  if (!/^[a-f0-9]{64}$/i.test(publicKeyHex) || !/^[a-f0-9]{128}$/i.test(signatureHex)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, "hex"));
  } catch { return false; }
}

/** Telegram webhook secret header check (constant time). */
export function verifyTelegramSecret(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

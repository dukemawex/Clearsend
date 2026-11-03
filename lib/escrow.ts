import { currentOwner } from "@/lib/owner";
import { recordActivity } from "./activity";
import { z } from "zod";
import { StructuredSpec } from "./spec";
import { checkPayoutEligibility, validateRecipientId, type RecipientType } from "./payout-countries";
import { Receipt, buildReceipt, fxAtEvent, type ReceiptKind } from "./receipts";

export const EscrowState = z.enum(["created", "funded", "submitted", "verified", "rejected", "released", "refunded"]);
export type EscrowState = z.infer<typeof EscrowState>;

export const EscrowRecord = z.object({
  ownerId: z.string().optional(),
  id: z.string(),
  state: EscrowState,
  payer: z.string(),
  payerEmail: z.string().email(),
  recipient: z.string(),
  recipientEmail: z.string().email().optional(),
  recipientPayerId: z.string().optional(),
  recipientPhone: z.string().optional(),
  recipientType: z.enum(["EMAIL", "PHONE", "PAYPAL_ID"]).optional(),
  receiveCurrency: z.string().length(3).optional(),
  payoutStatus: z.string().optional(),
  recipientCountry: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  specification: z.string(),
  acceptanceCriteria: z.array(z.string()).optional(),
  structuredSpec: StructuredSpec.optional(),
  orderId: z.string().optional(),
  captureId: z.string().optional(),
  payoutBatchId: z.string().optional(),
  payoutItemId: z.string().optional(),
  refundId: z.string().optional(),
  receipts: z.array(Receipt).optional(),
  deliverable: z.string().optional(),
  documents: z.array(z.object({
    role: z.enum(["spec", "deliverable"]),
    name: z.string(),
    kind: z.string(),
    size: z.number(),
    text: z.string(),
    truncated: z.boolean(),
    method: z.string(),
    note: z.string().optional(),
    uploadedAt: z.number(),
  })).optional(),
  evaluationResult: z.object({
    met: z.boolean(),
    reasons: z.string(),
    criteriaResults: z.array(z.object({ criterion: z.string(), met: z.boolean(), reason: z.string() })).optional(),
    evaluatedAt: z.number(),
  }).optional(),
  createdAt: z.number(),
  fundedAt: z.number().optional(),
  submittedAt: z.number().optional(),
  verifiedAt: z.number().optional(),
  releasedAt: z.number().optional(),
  refundedAt: z.number().optional(),
  timeline: z.array(z.object({ state: EscrowState, timestamp: z.number(), note: z.string().optional() })),
});

export type EscrowRecord = z.infer<typeof EscrowRecord>;

export class EscrowError extends Error {
  constructor(message: string, public readonly code: string = "ESCROW_ERROR") {
    super(message);
    this.name = "EscrowError";
  }
}

class MemoryStorage {
  private store = new Map<string, string>();
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  
  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace("*", "");
    return Array.from(this.store.keys()).filter((k) => k.startsWith(prefix));
  }
}

class UpstashStorage {
  private baseUrl: string;
  private token: string;
  
  constructor(url: string, token: string) {
    this.baseUrl = url;
    this.token = token;
  }
  
  async get(key: string): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash GET failed: ${response.status}`);
    const data = await response.json() as { result: string | null };
    return data.result;
  }
  
  async set(key: string, value: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: value,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash SET failed: ${response.status}`);
  }
  
  async keys(pattern: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash KEYS failed: ${response.status}`);
    const data = await response.json() as { result: string[] };
    return data.result || [];
  }
}

let storage: UpstashStorage | MemoryStorage | null = null;

function getStorage() {
  if (storage) return storage;
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (url && token) {
    storage = new UpstashStorage(url, token);
    return storage;
  }
  
  const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new EscrowError("Escrow storage not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production environment variables.", "STORAGE_NOT_CONFIGURED");
  }
  
  console.warn("escrow_storage_fallback", { message: "UPSTASH_REDIS_REST_URL/TOKEN not configured, using in-memory storage. Data will be lost on restart. This is only allowed in development." });
  storage = new MemoryStorage();
  return storage;
}

export async function createEscrow(input: {
  payer: string;
  payerEmail: string;
  recipient: string;
  recipientEmail?: string;
  recipientPayerId?: string;
  recipientPhone?: string;
  recipientType?: RecipientType;
  receiveCurrency?: string;
  recipientCountry: string;
  amount: number;
  currency: string;
  specification: string;
  acceptanceCriteria?: string[];
  structuredSpec?: StructuredSpec;
  specDocument?: { name: string; kind: string; size: number; text: string; truncated: boolean; method: string; note?: string; uploadedAt: number };
  ownerId?: string | null;
}): Promise<EscrowRecord> {
  const ownerId = input.ownerId !== undefined ? input.ownerId : await currentOwner();
  const type: RecipientType = input.recipientType ?? (input.recipientEmail ? "EMAIL" : input.recipientPhone ? "PHONE" : input.recipientPayerId ? "PAYPAL_ID" : "EMAIL");
  const rid = type === "EMAIL" ? input.recipientEmail : type === "PHONE" ? input.recipientPhone : input.recipientPayerId;
  if (rid) { const bad = validateRecipientId(type, rid); if (bad) throw new EscrowError(bad, "INVALID_RECIPIENT"); }
  const country = input.recipientCountry.trim().toUpperCase();
  const elig = checkPayoutEligibility(country, input.currency);
  if (!elig.ok) throw new EscrowError(elig.error, "PAYOUT_UNSUPPORTED");
  const id = `escrow_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  
  const escrow: EscrowRecord = {
    id,
    ownerId: ownerId ?? undefined,
    state: "created",
    payer: input.payer,
    payerEmail: input.payerEmail,
    recipient: input.recipient,
    recipientEmail: input.recipientEmail,
    recipientPayerId: input.recipientPayerId,
    recipientPhone: input.recipientPhone,
    recipientType: type,
    receiveCurrency: input.receiveCurrency?.toUpperCase(),
    recipientCountry: country,
    amount: input.amount,
    currency: input.currency,
    specification: input.specification,
    acceptanceCriteria: input.acceptanceCriteria,
    structuredSpec: input.structuredSpec,
    documents: input.specDocument ? [{ role: "spec", ...input.specDocument }] : undefined,
    createdAt: now,
    timeline: [{ state: "created", timestamp: now }],
  };
  
  await getStorage().set(`escrow:${id}`, JSON.stringify(escrow));
  console.info("escrow_created", { id, amount: input.amount, currency: input.currency });
  
  await recordActivity({ ownerId: escrow.ownerId, kind: "escrow", subject: escrow.id, actor: escrow.payer, summary: `Escrow created: ${escrow.amount} ${escrow.currency} from ${escrow.payer} to ${escrow.recipient} (${escrow.recipientCountry}).` });
  return escrow;
}

export async function getEscrow(id: string): Promise<EscrowRecord | null> {
  const raw = await getStorage().get(`escrow:${id}`);
  if (!raw) return null;
  try {
    return EscrowRecord.parse(JSON.parse(raw));
  } catch (error) {
    console.error("escrow_parse_error", { id, error });
    return null;
  }
}

/** Escrow ids a visitor opened through a valid role link ("shared with me"), keyed server-side by their owner id. */
export async function sharedEscrows(owner: string | null): Promise<{ id: string; role: "payer" | "recipient" | "verifier" }[]> {
  if (!owner) return [];
  try { return JSON.parse((await getStorage().get(`shared:${owner}`)) ?? "[]"); } catch { return []; }
}
export async function sharedEscrowIds(owner: string | null): Promise<string[]> { return (await sharedEscrows(owner)).map((s) => s.id); }
export async function addSharedEscrow(owner: string | null, id: string, role: "payer" | "recipient" | "verifier") {
  if (!owner) return;
  const list = await sharedEscrows(owner);
  if (!list.some((s) => s.id === id && s.role === role)) await getStorage().set(`shared:${owner}`, JSON.stringify([{ id, role }, ...list].slice(0, 200)));
}
/** May this owner see this escrow without a role token? Owner match or shared via a role link. Legacy (no ownerId) → never. */
export async function ownerCanSee(e: EscrowRecord, owner: string | null) {
  if (!owner) return false;
  return e.ownerId === owner || (await sharedEscrowIds(owner)).includes(e.id);
}

/** Only the given owner's escrows plus ones shared with them. No owner → nothing. Legacy records without ownerId are hidden. */
export async function listEscrows(owner: string | null): Promise<(EscrowRecord & { sharedRole?: "payer" | "recipient" | "verifier" })[]> {
  if (!owner) return [];
  const shared = new Map((await sharedEscrows(owner)).map((s) => [s.id, s.role] as const));
  return (await listAllEscrows()).filter((e) => e.ownerId === owner || shared.has(e.id)).map((e) => (e.ownerId === owner ? e : { ...e, sharedRole: shared.get(e.id) }));
}

async function listAllEscrows(): Promise<EscrowRecord[]> {
  const keys = await getStorage().keys("escrow:*");
  const records = await Promise.all(keys.map((key) => getStorage().get(key)));
  return records
    .filter((raw): raw is string => raw !== null)
    .map((raw) => {
      try {
        return EscrowRecord.parse(JSON.parse(raw));
      } catch {
        return null;
      }
    })
    .filter((r): r is EscrowRecord => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function updateEscrow(id: string, updates: Partial<EscrowRecord>, newState?: EscrowState): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  
  const updated = { ...escrow, ...updates };
  
  if (newState && newState !== escrow.state) {
    updated.state = newState;
    updated.timeline = [...escrow.timeline, { state: newState, timestamp: Date.now() }];
    
    const stateTimestamp = `${newState}At` as keyof EscrowRecord;
    if (stateTimestamp in updated) {
      (updated as Record<string, unknown>)[stateTimestamp] = Date.now();
    }
  }
  
  await getStorage().set(`escrow:${id}`, JSON.stringify(updated));
  console.info("escrow_updated", { id, state: updated.state });
  if (newState && newState !== escrow.state) {
    const msg: Record<string, string> = {
      funded: `Escrow funded: ${updated.amount} ${updated.currency} captured by PayPal (order ${updated.orderId ?? "?"}).`,
      submitted: `Deliverable submitted by ${updated.recipient}.`,
      verified: `AI verifier: deliverable meets the specification. Waiting for a human to release.`,
      rejected: `AI verifier: deliverable does not meet the specification.`,
      released: `Released ${updated.amount} ${updated.currency} to ${updated.recipient} via PayPal Payout (batch ${updated.payoutBatchId ?? "?"}).`,
      refunded: `Refunded ${updated.amount} ${updated.currency} to ${updated.payer} via PayPal.`,
    };
    await recordActivity({ ownerId: updated.ownerId, kind: newState === "verified" || newState === "rejected" ? "decision" : ["funded", "released", "refunded"].includes(newState) ? "paypal" : "escrow", subject: id, actor: newState === "verified" || newState === "rejected" ? "agent" : "ClearSend", summary: msg[newState] ?? `Escrow is now ${newState}.`, data: { state: newState } });
  } else if (updates.documents) {
    await recordActivity({ ownerId: updated.ownerId, kind: "escrow", subject: id, actor: "ClearSend", summary: `Document attached: ${updates.documents.at(-1)?.name ?? "file"}.` });
  }
  
  return updated;
}

export async function fundEscrow(id: string, orderId: string, captureId: string, status?: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "created") throw new EscrowError(`Escrow ${id} is already ${escrow.state}, cannot fund`, "INVALID_STATE");
  
  const receipt = await escrowReceipt({ ...escrow, orderId, captureId }, "funding", status ?? "COMPLETED");
  return updateEscrow(id, { orderId, captureId, receipts: [...(escrow.receipts ?? []), receipt] }, "funded");
}

export async function submitDeliverable(id: string, deliverable: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "funded") throw new EscrowError(`Escrow ${id} is ${escrow.state}, expected 'funded'`, "INVALID_STATE");
  if (!deliverable.trim() && !(escrow.documents ?? []).some((d) => d.role === "deliverable")) throw new EscrowError("Add a deliverable description or upload a deliverable document", "EMPTY_DELIVERABLE");
  
  return updateEscrow(id, { deliverable: deliverable.trim() || "(see uploaded deliverable documents)" }, "submitted");
}

export async function verifyDeliverable(id: string, result: EscrowRecord["evaluationResult"]): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "submitted") throw new EscrowError(`Escrow ${id} is ${escrow.state}, expected 'submitted'`, "INVALID_STATE");
  
  return updateEscrow(id, { evaluationResult: result }, result?.met ? "verified" : "rejected");
}

export async function releaseEscrow(id: string, payoutBatchId: string, payoutItemId?: string, status?: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "verified") throw new EscrowError(`Escrow ${id} is ${escrow.state}, expected 'verified'`, "INVALID_STATE");
  
  const receipt = await escrowReceipt({ ...escrow, payoutBatchId, payoutItemId }, "payout", status ?? "PENDING");
  return updateEscrow(id, { payoutBatchId, payoutItemId, payoutStatus: status ?? "PENDING", receipts: [...(escrow.receipts ?? []), receipt] }, "released");
}

export async function refundEscrow(id: string, refundId: string, status?: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (!["funded", "submitted", "rejected"].includes(escrow.state)) {
    throw new EscrowError(`Escrow ${id} is ${escrow.state}, cannot refund`, "INVALID_STATE");
  }
  if (!escrow.captureId) throw new EscrowError(`Escrow ${id} has no captureId, cannot refund`, "NO_CAPTURE");
  
  const receipt = await escrowReceipt({ ...escrow, refundId }, "refund", status ?? "COMPLETED");
  return updateEscrow(id, { refundId, receipts: [...(escrow.receipts ?? []), receipt] }, "refunded");
}

export async function attachEscrowDocument(id: string, role: "spec" | "deliverable", doc: { name: string; kind: string; size: number; text: string; truncated: boolean; method: string; note?: string; uploadedAt: number }): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  const docs = escrow.documents ?? [];
  if (docs.length >= 6) throw new EscrowError("This escrow already has the maximum of 6 documents", "TOO_MANY_DOCUMENTS");
  return updateEscrow(id, { documents: [...docs, { role, ...doc }] });
}

/** Builds a receipt from the stored escrow plus the real PayPal ids just returned; FX is a live quote at event time. */
async function escrowReceipt(e: EscrowRecord, kind: ReceiptKind, status: string): Promise<Receipt> {
  const receipt = buildReceipt({
    kind, subjectType: "escrow", subjectId: e.id, issuedAt: Date.now(),
    payer: e.payer, payerEmail: e.payerEmail, recipient: e.recipient, recipientEmail: e.recipientEmail, recipientCountry: e.recipientCountry,
    description: e.specification, amount: e.amount, currency: e.currency,
    fx: kind === "refund" ? null : await fxAtEvent(e.currency, e.recipientCountry, e.receiveCurrency),
    paypal: { orderId: e.orderId, captureId: e.captureId, payoutBatchId: kind === "payout" ? e.payoutBatchId : undefined, payoutItemId: kind === "payout" ? e.payoutItemId : undefined, refundId: kind === "refund" ? e.refundId : undefined },
    status,
  });
  await recordActivity({ kind: "paypal", subject: e.id, actor: "ClearSend", summary: `Receipt ${receipt.number} issued (${kind}, ${receipt.amount.toFixed(2)} ${receipt.currency}, ${status}).`, data: { receiptId: receipt.id } });
  return receipt;
}

/** PayPal receiver + recipient_type for this escrow's payout. */
export function payoutReceiver(e: EscrowRecord): { receiver: string; recipientType: RecipientType } | null {
  const t = e.recipientType ?? (e.recipientEmail ? "EMAIL" : e.recipientPhone ? "PHONE" : "PAYPAL_ID");
  const r = t === "EMAIL" ? e.recipientEmail : t === "PHONE" ? e.recipientPhone : e.recipientPayerId;
  return r ? { receiver: t === "PHONE" ? r.replace(/[\s()-]/g, "") : r, recipientType: t } : null;
}

export async function setPayoutStatus(id: string, payoutStatus: string) { return updateEscrow(id, { payoutStatus }); }

/** Webhook lookup: escrow by id, PayPal order, capture or payout batch. Scans records (small hackathon dataset). */
export async function findEscrowByPayPal(q: { id?: string; orderId?: string; captureId?: string; payoutBatchId?: string }): Promise<EscrowRecord | null> {
  if (q.id) { const e = await getEscrow(q.id); if (e) return e; }
  if (!q.orderId && !q.captureId && !q.payoutBatchId) return null;
  return (await listAllEscrows()).find((e) => (q.orderId && e.orderId === q.orderId) || (q.captureId && e.captureId === q.captureId) || (q.payoutBatchId && e.payoutBatchId === q.payoutBatchId)) ?? null;
}

/** Webhook reconcile for payouts: records PayPal's latest payout status on the escrow and its payout receipt. Never changes escrow state. */
export async function reconcilePayoutStatus(id: string, payoutStatus: string, payoutItemId?: string): Promise<EscrowRecord> {
  const e = await getEscrow(id);
  if (!e) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  const receipts = (e.receipts ?? []).map((r) => (r.kind === "payout" ? { ...r, status: payoutStatus } : r));
  return updateEscrow(id, { payoutStatus, payoutItemId: e.payoutItemId ?? payoutItemId, receipts });
}

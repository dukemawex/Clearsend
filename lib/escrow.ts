import { z } from "zod";

export const EscrowState = z.enum(["created", "funded", "submitted", "verified", "rejected", "released", "refunded"]);
export type EscrowState = z.infer<typeof EscrowState>;

export const EscrowRecord = z.object({
  id: z.string(),
  state: EscrowState,
  payer: z.string(),
  payerEmail: z.string().email(),
  recipient: z.string(),
  recipientEmail: z.string().email().optional(),
  recipientPayerId: z.string().optional(),
  recipientCountry: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  specification: z.string(),
  acceptanceCriteria: z.array(z.string()).optional(),
  orderId: z.string().optional(),
  captureId: z.string().optional(),
  payoutBatchId: z.string().optional(),
  payoutItemId: z.string().optional(),
  deliverable: z.string().optional(),
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

function getStorage() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (url && token) {
    return new UpstashStorage(url, token);
  }
  
  console.warn("escrow_storage_fallback", { message: "UPSTASH_REDIS_REST_URL/TOKEN not configured, using in-memory storage. Data will be lost on restart." });
  return new MemoryStorage();
}

const storage = getStorage();

export async function createEscrow(input: {
  payer: string;
  payerEmail: string;
  recipient: string;
  recipientEmail?: string;
  recipientPayerId?: string;
  recipientCountry: string;
  amount: number;
  currency: string;
  specification: string;
  acceptanceCriteria?: string[];
}): Promise<EscrowRecord> {
  const id = `escrow_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  
  const escrow: EscrowRecord = {
    id,
    state: "created",
    payer: input.payer,
    payerEmail: input.payerEmail,
    recipient: input.recipient,
    recipientEmail: input.recipientEmail,
    recipientPayerId: input.recipientPayerId,
    recipientCountry: input.recipientCountry,
    amount: input.amount,
    currency: input.currency,
    specification: input.specification,
    acceptanceCriteria: input.acceptanceCriteria,
    createdAt: now,
    timeline: [{ state: "created", timestamp: now }],
  };
  
  await storage.set(`escrow:${id}`, JSON.stringify(escrow));
  console.info("escrow_created", { id, amount: input.amount, currency: input.currency });
  
  return escrow;
}

export async function getEscrow(id: string): Promise<EscrowRecord | null> {
  const raw = await storage.get(`escrow:${id}`);
  if (!raw) return null;
  try {
    return EscrowRecord.parse(JSON.parse(raw));
  } catch (error) {
    console.error("escrow_parse_error", { id, error });
    return null;
  }
}

export async function listEscrows(): Promise<EscrowRecord[]> {
  const keys = await storage.keys("escrow:*");
  const records = await Promise.all(keys.map((key) => storage.get(key)));
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
  
  await storage.set(`escrow:${id}`, JSON.stringify(updated));
  console.info("escrow_updated", { id, state: updated.state });
  
  return updated;
}

export async function fundEscrow(id: string, orderId: string, captureId: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "created") throw new EscrowError(`Escrow ${id} is already ${escrow.state}, cannot fund`, "INVALID_STATE");
  
  return updateEscrow(id, { orderId, captureId }, "funded");
}

export async function submitDeliverable(id: string, deliverable: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "funded") throw new EscrowError(`Escrow ${id} is ${escrow.state}, expected 'funded'`, "INVALID_STATE");
  
  return updateEscrow(id, { deliverable }, "submitted");
}

export async function verifyDeliverable(id: string, result: EscrowRecord["evaluationResult"]): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "submitted") throw new EscrowError(`Escrow ${id} is ${escrow.state}, expected 'submitted'`, "INVALID_STATE");
  
  return updateEscrow(id, { evaluationResult: result }, result?.met ? "verified" : "rejected");
}

export async function releaseEscrow(id: string, payoutBatchId: string, payoutItemId?: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (escrow.state !== "verified") throw new EscrowError(`Escrow ${id} is ${escrow.state}, expected 'verified'`, "INVALID_STATE");
  
  return updateEscrow(id, { payoutBatchId, payoutItemId }, "released");
}

export async function refundEscrow(id: string, refundId: string): Promise<EscrowRecord> {
  const escrow = await getEscrow(id);
  if (!escrow) throw new EscrowError(`Escrow ${id} not found`, "NOT_FOUND");
  if (!["funded", "submitted", "rejected"].includes(escrow.state)) {
    throw new EscrowError(`Escrow ${id} is ${escrow.state}, cannot refund`, "INVALID_STATE");
  }
  if (!escrow.captureId) throw new EscrowError(`Escrow ${id} has no captureId, cannot refund`, "NO_CAPTURE");
  
  return updateEscrow(id, { orderId: refundId }, "refunded");
}

import { recordActivity } from "./activity";
import { z } from "zod";

export const TripState = z.enum([
  "draft",
  "passenger_details_pending",
  "payment_pending",
  "payment_approved",
  "ticketing",
  "confirmed",
  "failed",
  "refunded"
]);
export type TripState = z.infer<typeof TripState>;

export const PassengerDetails = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email(),
  phone: z.string().min(5),
  gender: z.enum(["male", "female"]),
  title: z.enum(["mr", "ms", "mrs", "dr"]),
});
export type PassengerDetails = z.infer<typeof PassengerDetails>;

export const TripRecord = z.object({
  id: z.string(),
  state: TripState,
  userId: z.string().optional(),
  
  // Flight details
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  airline: z.string(),
  airlineCode: z.string().optional(),
  flightNumber: z.string().optional(),
  duration: z.string().optional(),
  stops: z.number(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  
  // Pricing
  basePrice: z.number(),
  serviceFee: z.number(),
  totalPrice: z.number(),
  currency: z.string(),
  
  // Provider
  provider: z.enum(["duffel", "rapidapi", "aviationstack"]),
  providerOfferId: z.string().optional(),
  
  // Passenger
  passenger: PassengerDetails.optional(),
  
  // PayPal
  paypalOrderId: z.string().optional(),
  paypalCaptureId: z.string().optional(),
  paypalPaymentTokenId: z.string().optional(), // For Vault
  
  // Duffel booking (only for duffel provider)
  duffelOrderId: z.string().optional(),
  duffelBookingReference: z.string().optional(),
  duffelPnr: z.string().optional(),
  
  // Refund
  refundId: z.string().optional(),
  refundReason: z.string().optional(),
  
  // Timestamps
  createdAt: z.number(),
  updatedAt: z.number(),
  paymentCompletedAt: z.number().optional(),
  ticketedAt: z.number().optional(),
  
  // Activity log
  timeline: z.array(z.object({
    state: TripState,
    timestamp: z.number(),
    note: z.string().optional(),
  })),
});
export type TripRecord = z.infer<typeof TripRecord>;

export class TripError extends Error {
  constructor(message: string, public readonly code: string = "TRIP_ERROR") {
    super(message);
    this.name = "TripError";
  }
}

// Storage abstraction
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
    throw new TripError("Trip storage not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.", "STORAGE_NOT_CONFIGURED");
  }
  
  console.warn("trip_storage_fallback: Using in-memory storage. Data will be lost on restart.");
  storage = new MemoryStorage();
  return storage;
}

export async function createTrip(input: {
  origin: string;
  destination: string;
  departureDate: string;
  airline: string;
  airlineCode?: string;
  flightNumber?: string;
  duration?: string;
  stops: number;
  departureTime: string;
  arrivalTime: string;
  basePrice: number;
  currency: string;
  provider: "duffel" | "rapidapi" | "aviationstack";
  providerOfferId?: string;
}): Promise<TripRecord> {
  const id = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  
  const serviceFee = input.basePrice * 0.03; // 3% service fee
  const totalPrice = input.basePrice + serviceFee;
  
  const trip: TripRecord = {
    id,
    state: "draft",
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    airline: input.airline,
    airlineCode: input.airlineCode,
    flightNumber: input.flightNumber,
    duration: input.duration,
    stops: input.stops,
    departureTime: input.departureTime,
    arrivalTime: input.arrivalTime,
    basePrice: input.basePrice,
    serviceFee,
    totalPrice,
    currency: input.currency,
    provider: input.provider,
    providerOfferId: input.providerOfferId,
    createdAt: now,
    updatedAt: now,
    timeline: [{ state: "draft", timestamp: now }],
  };
  
  await getStorage().set(`trip:${id}`, JSON.stringify(trip));
  console.info("trip_created", { id, origin: input.origin, destination: input.destination });
  await recordActivity({ kind: "trip", subject: id, actor: "ClearSend", summary: `Chose ${input.airline} ${input.origin} → ${input.destination} on ${input.departureDate}: fare ${input.basePrice.toFixed(2)} ${input.currency} (${input.provider}).` });
  
  return trip;
}

export async function getTrip(id: string): Promise<TripRecord | null> {
  const raw = await getStorage().get(`trip:${id}`);
  if (!raw) return null;
  try {
    return TripRecord.parse(JSON.parse(raw));
  } catch (error) {
    console.error("trip_parse_error", { id, error });
    return null;
  }
}

export async function listTrips(userId?: string): Promise<TripRecord[]> {
  const keys = await getStorage().keys("trip:*");
  const records = await Promise.all(keys.map((key) => getStorage().get(key)));
  const trips = records
    .filter((raw): raw is string => raw !== null)
    .map((raw) => {
      try {
        return TripRecord.parse(JSON.parse(raw));
      } catch {
        return null;
      }
    })
    .filter((r): r is TripRecord => r !== null);
  
  if (userId) {
    return trips.filter((t) => t.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  }
  
  return trips.sort((a, b) => b.createdAt - a.createdAt);
}

async function updateTrip(id: string, updates: Partial<TripRecord>, newState?: TripState): Promise<TripRecord> {
  const trip = await getTrip(id);
  if (!trip) throw new TripError(`Trip ${id} not found`, "NOT_FOUND");
  
  const updated = { ...trip, ...updates, updatedAt: Date.now() };
  
  if (newState && newState !== trip.state) {
    updated.state = newState;
    updated.timeline = [...trip.timeline, { state: newState, timestamp: Date.now() }];
    
    const stateTimestamp = `${newState}At` as keyof TripRecord;
    if (stateTimestamp in updated) {
      (updated as Record<string, unknown>)[stateTimestamp] = Date.now();
    }
  }
  
  await getStorage().set(`trip:${id}`, JSON.stringify(updated));
  console.info("trip_updated", { id, state: updated.state });
  if (newState && newState !== trip.state) {
    await recordActivity({ kind: newState === "payment_approved" || newState === "refunded" ? "paypal" : "trip", subject: id, actor: "ClearSend", summary: newState === "payment_approved" ? `PayPal captured ${updated.totalPrice.toFixed(2)} ${updated.currency} for ${updated.origin} → ${updated.destination}.` : `Trip ${updated.origin} → ${updated.destination} is now ${newState.replace(/_/g, " ")}.`, data: { state: newState } });
  }
  
  return updated;
}

export async function addPassengerDetails(id: string, passenger: PassengerDetails): Promise<TripRecord> {
  return updateTrip(id, { passenger }, "payment_pending");
}

export async function markPaymentApproved(id: string, orderId: string, captureId: string, paymentTokenId?: string): Promise<TripRecord> {
  return updateTrip(id, { 
    paypalOrderId: orderId, 
    paypalCaptureId: captureId,
    paypalPaymentTokenId: paymentTokenId,
    paymentCompletedAt: Date.now()
  }, "payment_approved");
}

export async function markTicketing(id: string): Promise<TripRecord> {
  return updateTrip(id, {}, "ticketing");
}

export async function confirmTrip(id: string, duffelOrderId?: string, bookingRef?: string, pnr?: string): Promise<TripRecord> {
  return updateTrip(id, {
    duffelOrderId,
    duffelBookingReference: bookingRef,
    duffelPnr: pnr,
    ticketedAt: Date.now()
  }, "confirmed");
}

export async function failTrip(id: string, reason: string): Promise<TripRecord> {
  return updateTrip(id, { refundReason: reason }, "failed");
}

export async function refundTrip(id: string, refundId: string, reason: string): Promise<TripRecord> {
  return updateTrip(id, { refundId, refundReason: reason }, "refunded");
}

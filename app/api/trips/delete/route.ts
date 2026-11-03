import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DeleteTripSchema = z.object({
  tripId: z.string(),
});

class UpstashStorage {
  private baseUrl: string;
  private token: string;
  
  constructor(url: string, token: string) {
    this.baseUrl = url;
    this.token = token;
  }
  
  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash DEL failed: ${response.status}`);
  }
}

class MemoryStorage {
  private store = new Map<string, string>();
  
  delete(key: string): void {
    this.store.delete(key);
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
  
  storage = new MemoryStorage();
  return storage;
}

export async function POST(request: NextRequest) {
  try {
    const serviceKey = request.headers.get("x-clearsend-api-key");
    
    if (!serviceKey || serviceKey !== process.env.CLEAR_SEND_API_KEY) {
      return NextResponse.json({ error: "Service key required" }, { status: 401 });
    }
    
    const body = await request.json();
    const { tripId } = DeleteTripSchema.parse(body);
    
    await getStorage().delete(`trip:${tripId}`);
    console.info("trip_deleted", { id: tripId });
    
    return NextResponse.json({ success: true, message: `Trip ${tripId} deleted` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    console.error("trip_delete_error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete trip" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { loadReceipt } from "@/lib/receipt-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sp = new URL(request.url).searchParams;
    const res = await loadReceipt(id, { role: sp.get("role"), token: sp.get("token"), serviceKey: request.headers.get("x-clearsend-api-key") });
    if (res.status !== 200) return NextResponse.json({ error: res.error }, { status: res.status, headers: { "cache-control": "no-store" } });
    return NextResponse.json(res.receipt, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("receipt_get_error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to load receipt" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createPayout, getPayoutStatus, PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";

export async function POST(request: Request) { try { return NextResponse.json(await createPayout(await request.json()), { status: 201 }); } catch (error) { const paypalError = error as PayPalError; console.error("payout_create_failed", error); return NextResponse.json({ error: paypalError.message ?? "Unable to create payout" }, { status: paypalError.status ?? 500 }); } }
export async function GET(request: Request) { const id = new URL(request.url).searchParams.get("batchId"); if (!id) return NextResponse.json({ error: "batchId is required" }, { status: 400 }); try { return NextResponse.json(await getPayoutStatus(id)); } catch (error) { const paypalError = error as PayPalError; return NextResponse.json({ error: paypalError.message }, { status: paypalError.status ?? 500 }); } }
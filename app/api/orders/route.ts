import { NextResponse } from "next/server";
import { captureOrder, createOrder, getOrder, PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";

export async function POST(request: Request) { try { const body = await request.json(); if (body.action === "capture") return NextResponse.json(await captureOrder(body.orderId)); return NextResponse.json(await createOrder(body), { status: 201 }); } catch (error) { const paypalError = error as PayPalError; console.error("order_request_failed", error); return NextResponse.json({ error: paypalError.message ?? "Unable to process order" }, { status: paypalError.status ?? 500 }); } }
export async function GET(request: Request) { const id = new URL(request.url).searchParams.get("orderId"); if (!id) return NextResponse.json({ error: "orderId is required" }, { status: 400 }); try { return NextResponse.json(await getOrder(id)); } catch (error) { const paypalError = error as PayPalError; return NextResponse.json({ error: paypalError.message }, { status: paypalError.status ?? 500 }); } }
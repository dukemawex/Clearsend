import { NextResponse } from "next/server";
import { captureOrder, createOrder, getOrder, PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";

function authenticate(request: Request): boolean {
  const apiKey = request.headers.get("x-clearsend-api-key");
  const configuredKey = process.env.CLEAR_SEND_API_KEY;
  if (!configuredKey) {
    console.warn("CLEAR_SEND_API_KEY not configured - orders endpoint is unprotected");
    return true;
  }
  return apiKey === configuredKey;
}

export async function POST(request: Request) { 
  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized - valid x-clearsend-api-key header required" }, { status: 401 });
  }
  try { 
    const body = await request.json(); 
    if (body.action === "capture") return NextResponse.json(await captureOrder(body.orderId)); 
    return NextResponse.json(await createOrder(body), { status: 201 }); 
  } catch (error) { 
    const paypalError = error as PayPalError; 
    console.error("order_request_failed", error); 
    return NextResponse.json({ error: paypalError.message ?? "Unable to process order" }, { status: paypalError.status ?? 500 }); 
  } 
}

export async function GET(request: Request) { 
  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized - valid x-clearsend-api-key header required" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("orderId"); 
  if (!id) return NextResponse.json({ error: "orderId is required" }, { status: 400 }); 
  try { 
    return NextResponse.json(await getOrder(id)); 
  } catch (error) { 
    const paypalError = error as PayPalError; 
    return NextResponse.json({ error: paypalError.message }, { status: paypalError.status ?? 500 }); 
  } 
}
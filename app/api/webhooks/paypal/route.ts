import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const event = await request.json().catch(() => null);
  console.info("paypal_webhook_received", { eventType: event?.event_type, resourceId: event?.resource?.id });
  // Production verification can be added with PayPal's webhook signature endpoint.
  return NextResponse.json({ received: true });
}
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Throwaway PayPal SANDBOX buyer login for testers. Only returned when the app runs in sandbox
// and the owner set SANDBOX_BUYER_EMAIL / SANDBOX_BUYER_PASSWORD. These are never real PayPal credentials.
export async function GET() {
  const sandbox = (process.env.PAYPAL_ENV ?? "sandbox") === "sandbox";
  const email = sandbox ? process.env.SANDBOX_BUYER_EMAIL : undefined;
  const password = sandbox ? process.env.SANDBOX_BUYER_PASSWORD : undefined;
  return NextResponse.json({ sandbox, buyer: email && password ? { email, password } : null, testCard: sandbox ? { brand: "Visa", number: "4012888888881881", source: "https://developer.paypal.com/tools/sandbox/card-testing/" } : null }, { headers: { "cache-control": "no-store" } });
}

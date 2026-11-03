import { NextResponse } from "next/server";
import { getMidMarketRate } from "@/lib/fx";

export const dynamic = "force-dynamic";
const FEE = 0.025, SPREAD = 0.012;

// Live quote: real mid-market rate, ClearSend's 1.2% FX spread and 2.5% fee shown separately.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const amount = Number(u.searchParams.get("amount"));
  const from = (u.searchParams.get("from") ?? "USD").toUpperCase();
  const to = (u.searchParams.get("to") ?? "USD").toUpperCase();
  if (!(amount > 0) || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return NextResponse.json({ error: "amount>0, from and to (ISO codes) are required" }, { status: 400 });
  try {
    const { rate, source } = from === to ? { rate: 1, source: "same currency" } : await getMidMarketRate(from, to);
    const fee = +(amount * FEE).toFixed(2);
    const effectiveRate = from === to ? 1 : rate * (1 - SPREAD);
    // Fee model (see lib/receipts.ts): payer is charged `amount`; the 2.5% fee is withheld from the payout.
    const received = +((amount - fee) * effectiveRate).toFixed(2);
    return NextResponse.json({ amount, from, to, midRate: rate, effectiveRate, source, fee, spreadPct: from === to ? 0 : SPREAD * 100, feePct: FEE * 100, totalCharged: amount, payoutAmount: +(amount - fee).toFixed(2), received, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: `FX rate unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}

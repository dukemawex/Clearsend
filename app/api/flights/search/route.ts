import { NextResponse } from "next/server";
import { z } from "zod";
import { searchFlights } from "@/lib/flights";
import { recordActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({ origin: z.string().trim().min(2).max(40), destination: z.string().trim().min(2).max(40), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), passengers: z.number().int().min(1).max(9).optional() });

// Public web search used by /plan. Same backend the agent uses; never invents prices.
export async function POST(req: Request) {
  const p = Input.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Invalid input", details: p.error.issues }, { status: 400 });
  try {
    const r = await searchFlights(p.data);
    const priced = r.options.filter((o) => typeof o.price === "number" && o.price > 0 && !o.scheduleOnly).length;
    await recordActivity({ kind: "flight-search", subject: `${r.origin}-${r.destination}`, actor: "web", summary: `Searched ${r.origin} → ${r.destination} on ${r.dateUsed ?? p.data.date ?? "next date"}: ${r.options.length} options, ${priced} with a live fare${r.provider ? ` (${r.provider})` : ""}.` });
    return NextResponse.json({ ...r, priced });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

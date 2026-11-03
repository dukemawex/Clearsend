import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteActivity, hasServiceKey, listActivity, listOwnerActivity, recordActivity } from "@/lib/activity";
import { ownerFromRequest } from "@/lib/owner";
import { sharedEscrowIds } from "@/lib/escrow";

export const dynamic = "force-dynamic";

function deny(req: Request) {
  if (!process.env.CLEAR_SEND_API_KEY) return NextResponse.json({ error: "CLEAR_SEND_API_KEY is not configured" }, { status: 503 });
  if (!req.headers.get("x-clearsend-api-key")) return NextResponse.json({ error: "Missing x-clearsend-api-key" }, { status: 401 });
  if (!hasServiceKey(req)) return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(u.searchParams.get("limit") ?? 100) || 100));
    const filter = { subject: u.searchParams.get("subject") ?? undefined, kind: u.searchParams.get("kind") ?? undefined, q: u.searchParams.get("q") ?? undefined };
    const full = hasServiceKey(req);
    // Browsers only see their own activity (cs_uid) and activity on escrows shared with them; the service key sees all.
    const owner = ownerFromRequest(req);
    const items = full ? await listActivity(limit, filter) : await listOwnerActivity(owner, limit, filter, await sharedEscrowIds(owner).catch(() => []));
    return NextResponse.json({ ok: true, count: items.length, items: full ? items : items.map((a) => ({ ...a, data: undefined })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

const Status = z.object({ subject: z.string().trim().min(1).max(64), summary: z.string().trim().min(1).max(500), actor: z.string().trim().min(1).max(80).default("agent"), kind: z.enum(["status", "decision", "confirmation"]).default("status") });

export async function POST(req: Request) {
  const d = deny(req);
  if (d) return d;
  const parsed = Status.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  const item = await recordActivity(parsed.data);
  return NextResponse.json({ ok: Boolean(item), item }, { status: item ? 201 : 503 });
}

export async function DELETE(req: Request) {
  const d = deny(req);
  if (d) return d;
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? undefined;
  const subject = u.searchParams.get("subject") ?? undefined;
  if (!id && !subject) return NextResponse.json({ ok: false, error: "Pass ?id= or ?subject=" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, deleted: await deleteActivity({ id, subject }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

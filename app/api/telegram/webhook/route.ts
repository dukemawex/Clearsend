import { after, NextResponse } from "next/server";
import { verifyTelegramSecret } from "@/lib/chatbots/security";
import { handleUpdate, type TgUpdate } from "@/lib/chatbots/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let update: TgUpdate;
  try { update = (await request.json()) as TgUpdate; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (typeof update?.update_id !== "number") return NextResponse.json({ error: "Not a Telegram update" }, { status: 400 });
  if (!process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: true, note: "TELEGRAM_BOT_TOKEN not configured" });
  try {
    const deferred = await handleUpdate(update);
    if (deferred) after(async () => { try { await deferred(); } catch (e) { console.error("telegram_deferred_failed", { error: e instanceof Error ? e.message : "unknown" }); } });
  } catch (e) {
    console.error("telegram_update_failed", { error: e instanceof Error ? e.message : "unknown" });
  }
  return NextResponse.json({ ok: true }); // always 200 so Telegram doesn't hammer retries
}

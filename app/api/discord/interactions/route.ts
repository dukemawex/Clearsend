import { after, NextResponse } from "next/server";
import { verifyDiscordSignature } from "@/lib/chatbots/security";
import { handleInteraction, type Interaction } from "@/lib/chatbots/discord";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  const ok = verifyDiscordSignature(process.env.DISCORD_PUBLIC_KEY, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), raw);
  if (!ok) return NextResponse.json({ error: "Bad request signature" }, { status: 401 });
  let interaction: Interaction;
  try { interaction = JSON.parse(raw) as Interaction; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  try {
    const result = await handleInteraction(interaction);
    if (result.after) after(async () => { try { await result.after!(); } catch (e) { console.error("discord_deferred_failed", { error: e instanceof Error ? e.message : "unknown" }); } });
    return NextResponse.json(result.body);
  } catch (e) {
    console.error("discord_interaction_failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ type: 4, data: { content: "ClearSend hit an error. Try again.", flags: 64 } });
  }
}

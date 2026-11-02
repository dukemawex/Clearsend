import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.messages)) return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    const messages = body.messages.filter((message: unknown): message is { role: "user" | "assistant" | "system"; content: string } => typeof message === "object" && message !== null && "role" in message && "content" in message && typeof (message as { content: unknown }).content === "string");
    const result = await runAgent(messages);
    return NextResponse.json({ text: result.text, usage: result.usage });
  } catch (error) {
    console.error("agent_request_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent request failed" }, { status: 500 });
  }
}
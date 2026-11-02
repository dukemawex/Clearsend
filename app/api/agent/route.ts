import { NextResponse } from "next/server";
import { convertToModelMessages } from "ai";
import { streamAgent } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.messages)) return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    const messages = body.messages.filter((message: unknown) => typeof message === "object" && message !== null && "role" in message && "parts" in message);
    const modelMessages = await convertToModelMessages(messages);
    const result = streamAgent(modelMessages);
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("agent_request_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent request failed" }, { status: 500 });
  }
}
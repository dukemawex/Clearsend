import { NextResponse } from "next/server";
import { convertToModelMessages } from "ai";
import { streamAgent, getAvailableProviders } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.messages)) return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    
    const providers = getAvailableProviders();
    if (providers.length === 0) {
      return NextResponse.json({ error: "No AI provider is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY in environment variables to enable the agent." }, { status: 503 });
    }
    
    const messages = body.messages.filter((message: unknown) => typeof message === "object" && message !== null && "role" in message && "parts" in message);
    const modelMessages = await convertToModelMessages(messages);
    
    let lastError: Error | null = null;
    for (let i = 0; i < providers.length; i++) {
      try {
        const result = streamAgent(modelMessages, i);
        return result.toUIMessageStreamResponse();
      } catch (error) {
        console.error(`Provider ${providers[i].name} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < providers.length - 1) {
          console.log(`Trying next provider: ${providers[i + 1].name}`);
        }
      }
    }
    
    const errorMessage = lastError ? `All AI providers failed. Last error: ${lastError.message}` : "All AI providers failed.";
    return NextResponse.json({ error: errorMessage }, { status: 503 });
  } catch (error) {
    console.error("agent_request_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent request failed" }, { status: 500 });
  }
}
import { createOpenAI } from "@ai-sdk/openai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { generateText, streamText, tool } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { captureOrder, createOrder, createPayout, getOrder, getPayoutStatus } from "@/lib/paypal";
import { searchFlights } from "@/lib/flights";

const nvidia = createOpenAI({ apiKey: process.env.NVIDIA_API_KEY ?? "not-configured", baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1" });
const openrouter = createOpenAI({ apiKey: process.env.OPENROUTER_API_KEY ?? "not-configured", baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1", headers: { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", "X-Title": "ClearSend" } });
const paypalToolkit = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? new PayPalAgentToolkit({ clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET, configuration: { context: { sandbox: true }, actions: { orders: { create: true, get: true }, invoices: { create: true, get: true, list: true }, products: { create: true, list: true }, disputes: { list: true, get: true } } } }) : null;

export function getAvailableProviders() {
  const providers = [];
  if (process.env.NVIDIA_API_KEY) {
    providers.push({
      name: "NVIDIA",
      model: nvidia.chat(process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct"),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: "OpenRouter",
      model: openrouter.chat(process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct:free"),
    });
  }
  return providers;
}

export const agentTools = {
  calculateRemittance: tool({ description: "Calculate a transparent remittance breakdown for any destination. Fee is 2.5% and FX includes a 1.2% spread over the supplied mid-market rate. Use this before proposing a payout.", inputSchema: z.object({ amount: z.number().positive(), destination: z.string(), currency: z.string().length(3).default("USD"), midMarketRate: z.number().positive().default(1) }), execute: async ({ amount, destination, currency, midMarketRate }) => { const fee = amount * 0.025; const fxRate = midMarketRate * 0.988; return { amountSent: amount, fee: Number(fee.toFixed(2)), fxRate: Number(fxRate.toFixed(4)), amountReceived: Number(((amount - fee) * fxRate).toFixed(2)), destination, currency }; } }),
  searchFlights: tool({ description: "Search real worldwide flight offers using the configured provider chain. Accept IATA codes or city names. For a multi-part journey, search after calculating remittance costs and present both results before asking for approval.", inputSchema: z.object({ destination: z.string().min(2), origin: z.string().min(2), date: z.string().optional() }), execute: async (input) => searchFlights(input) }),
  createPayout: tool({ description: "Create a PayPal sandbox payout only after the user has explicitly approved the displayed remittance breakdown. Ask for the recipient email if it is not present.", inputSchema: z.object({ recipientEmail: z.string().email(), amount: z.number().positive(), currency: z.string().length(3).default("USD"), note: z.string().optional() }), needsApproval: true, execute: async (input) => createPayout(input) }),
  createOrder: tool({ description: "Create a PayPal sandbox order for the selected flight only after the user has explicitly approved the displayed journey total. Returns an approval URL for the user to complete payment in PayPal sandbox.", inputSchema: z.object({ amount: z.number().positive(), description: z.string() }), needsApproval: true, execute: async (input) => { const order = await createOrder(input); const links = order.links as Array<{ rel: string; href: string }> | undefined; const approveUrl = links?.find((l) => l.rel === "approve")?.href; return { orderId: order.id, status: order.status, approveUrl, message: approveUrl ? `Order created. User must approve at: ${approveUrl}` : "Order created but no approval URL found." }; } }),
  captureOrder: tool({ description: "Capture a PayPal order after the user has approved it in their PayPal account. Only call this after the user confirms they have completed approval.", inputSchema: z.object({ orderId: z.string() }), execute: async ({ orderId }) => captureOrder(orderId) }),
  getStatus: tool({ description: "Check the status of a PayPal payout batch or order.", inputSchema: z.object({ id: z.string(), kind: z.enum(["payout", "order"]) }), execute: async ({ id, kind }) => kind === "payout" ? getPayoutStatus(id) : getOrder(id) }),
};

export async function runAgent(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error("No AI provider is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY in environment variables to enable the agent.");
  }
  
  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      return await generateText({ model: provider.model, system: "You are ClearSend, a precise and warm remittance and flight assistant. Handle multi-part requests by calling every relevant read-only tool first, then present one combined summary. Always show fees, FX, received amount, flight prices, and a journey total. Never imply a payment was made unless a tool confirms it. PayPal actions are sandbox-only and require explicit user approval; never bypass tool approval.", messages, tools: { ...agentTools, ...(paypalToolkit?.getTools() ?? {}) }, maxOutputTokens: 700, stopWhen: ({ steps }) => steps.length >= 5 });
    } catch (error) {
      console.error(`${provider.name} provider failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  
  throw new Error(`All AI providers failed. Last error: ${lastError?.message || "Unknown error"}`);
}

export function streamAgent(messages: ModelMessage[], providerIndex: number = 0) {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error("No AI provider is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY in environment variables to enable the agent.");
  }
  
  if (providerIndex >= providers.length) {
    throw new Error(`Provider index ${providerIndex} out of range. Only ${providers.length} provider(s) available.`);
  }

  const provider = providers[providerIndex];
  const systemPrompt = "You are ClearSend, a precise and warm remittance and travel assistant. Help users send money across borders (show transparent fees and FX rates) and plan travel (search flights). Handle multi-part requests by calling every relevant read-only tool first, then present one combined summary. Always show fees, FX, received amount, flight prices, and a journey total. Never imply a payment was made unless a tool confirms it. PayPal actions are sandbox-only and require explicit user approval; never bypass tool approval. For cross-border remittances, ask for recipient email and destination details. For travel, ask for origin, destination, and dates.";

  console.log(`Using ${provider.name} provider for agent stream`);

  return streamText({
    model: provider.model,
    system: systemPrompt,
    messages,
    tools: { ...agentTools, ...(paypalToolkit?.getTools() ?? {}) },
    maxOutputTokens: 700,
    stopWhen: ({ steps }) => steps.length >= 5,
    onError: ({ error }) => {
      console.error(`${provider.name} stream error:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `${provider.name} failed: ${errorMessage}`;
    },
  });
}
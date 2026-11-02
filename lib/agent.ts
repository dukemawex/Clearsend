import { createOpenAI } from "@ai-sdk/openai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { generateText, streamText, tool } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { captureOrder, createOrder, createPayout, getOrder, getPayoutStatus } from "@/lib/paypal";
import { searchFlights } from "@/lib/flights";
import { getMidMarketRate } from "@/lib/fx";
import { createEscrow, getEscrow, listEscrows } from "@/lib/escrow";

const nvidia = createOpenAI({ apiKey: process.env.NVIDIA_API_KEY ?? "not-configured", baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1" });
const openrouter = createOpenAI({ apiKey: process.env.OPENROUTER_API_KEY ?? "not-configured", baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1", headers: { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", "X-Title": "ClearSend" } });
const paypalToolkit = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? new PayPalAgentToolkit({ clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET, configuration: { context: { sandbox: true }, actions: { orders: { create: true, get: true }, invoices: { create: true, get: true, list: true }, products: { create: true, list: true }, disputes: { list: true, get: true } } } }) : null;

export function getAvailableProviders() {
  const providers = [];
  if (process.env.NVIDIA_API_KEY) {
    providers.push({
      name: "NVIDIA",
      model: nvidia.chat(process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct"),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: "OpenRouter",
      model: openrouter.chat(process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct"),
    });
  }
  return providers;
}

function shouldExposePayPalTools(messages: ModelMessage[]): boolean {
  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  if (!lastUserMessage) return false;
  const content = typeof lastUserMessage.content === "string" ? lastUserMessage.content : "";
  const paymentKeywords = /payment|pay|escrow|fund|payout|invoice|order|checkout|deposit|release|refund|freelance|job|deliverable|secure.*payment/i;
  const flightOnlyKeywords = /^(search|find|show|look|get|check).*(flight|airline|route)/i;
  if (flightOnlyKeywords.test(content) && !paymentKeywords.test(content)) return false;
  return paymentKeywords.test(content);
}

export const agentTools = {
  calculateRemittance: tool({ description: "Calculate a transparent remittance breakdown for any destination. Fee is 2.5% and FX includes a 1.2% spread over the real mid-market rate. Fetches live exchange rates server-side. Use this before proposing a payout. MUST provide destinationCurrency (e.g. NGN for Nigeria, GBP for UK, EUR for Europe).", inputSchema: z.object({ amount: z.number().positive(), sourceCurrency: z.string().length(3).default("USD"), destinationCurrency: z.string().length(3), destination: z.string() }), execute: async ({ amount, sourceCurrency, destinationCurrency, destination }) => { try { const { rate: midMarketRate, source } = await getMidMarketRate(sourceCurrency, destinationCurrency); const fee = amount * 0.025; const fxRate = midMarketRate * 0.988; return { amountSent: amount, fee: Number(fee.toFixed(2)), fxRate: Number(fxRate.toFixed(4)), amountReceived: Number(((amount - fee) * fxRate).toFixed(2)), destination, currency: sourceCurrency, destinationCurrency: destinationCurrency.toUpperCase(), midMarketRate: Number(midMarketRate.toFixed(4)), rateSource: source }; } catch (error) { throw new Error(`Unable to calculate remittance: ${error instanceof Error ? error.message : "FX rate unavailable"}`); } } }),
  searchFlights: tool({ description: "Search real worldwide flight offers using the configured provider chain. Accept IATA codes or city names. If user provides a date, use it exactly (YYYY-MM-DD format). If no date provided, ask user for a specific date or default to 30 days from today. NEVER reference dates, flights, or conversation context not explicitly present in this request. When no offers are found (success: false), tell user plainly and ask for a specific date or alternate route. Do NOT invent or assume prior conversation.", inputSchema: z.object({ destination: z.string().min(2), origin: z.string().min(2), date: z.string().optional() }), execute: async (input) => searchFlights(input) }),
  createPayout: tool({ description: "Create a PayPal sandbox payout only after the user has explicitly approved the displayed remittance breakdown. Ask for the recipient email if it is not present.", inputSchema: z.object({ recipientEmail: z.string().email(), amount: z.number().positive(), currency: z.string().length(3).default("USD"), note: z.string().optional() }), needsApproval: true, execute: async (input) => createPayout(input) }),
  createOrder: tool({ description: "Create a PayPal sandbox order for the selected flight only after the user has explicitly approved the displayed journey total. Returns an approval URL for the user to complete payment in PayPal sandbox.", inputSchema: z.object({ amount: z.number().positive(), description: z.string() }), needsApproval: true, execute: async (input) => { const order = await createOrder(input); const links = order.links as Array<{ rel: string; href: string }> | undefined; const approveUrl = links?.find((l) => l.rel === "approve")?.href; return { orderId: order.id, status: order.status, approveUrl, message: approveUrl ? `Order created. User must approve at: ${approveUrl}` : "Order created but no approval URL found." }; } }),
  captureOrder: tool({ description: "Capture a PayPal order after the user has approved it in their PayPal account. Only call this after the user confirms they have completed approval.", inputSchema: z.object({ orderId: z.string() }), execute: async ({ orderId }) => captureOrder(orderId) }),
  getStatus: tool({ description: "Check the status of a PayPal payout batch or order.", inputSchema: z.object({ id: z.string(), kind: z.enum(["payout", "order"]) }), execute: async ({ id, kind }) => kind === "payout" ? getPayoutStatus(id) : getOrder(id) }),
  createEscrow: tool({ description: "Create a PayPal sandbox escrow for secure payment with deliverable verification. Use for freelance jobs, service agreements, or any transaction requiring proof of delivery before release. Funds held until deliverable meets acceptance criteria.", inputSchema: z.object({ payer: z.string(), payerEmail: z.string().email(), recipient: z.string(), recipientEmail: z.string().email().optional(), recipientPayerId: z.string().optional(), recipientCountry: z.string(), amount: z.number().positive(), currency: z.string().length(3).default("USD"), specification: z.string(), acceptanceCriteria: z.array(z.string()).optional() }), execute: async (input) => createEscrow(input) }),
  getEscrow: tool({ description: "Get the current state and details of an escrow by ID. Shows state, timeline, amounts, specification, deliverable (if submitted), and evaluation results.", inputSchema: z.object({ id: z.string() }), execute: async ({ id }) => getEscrow(id) }),
  listEscrows: tool({ description: "List all escrows in the system, ordered by creation date (newest first).", inputSchema: z.object({}), execute: async () => listEscrows() }),
};

export async function runAgent(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error("No AI provider is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY in environment variables to enable the agent.");
  }
  
  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      const exposePayPal = shouldExposePayPalTools(messages as ModelMessage[]);
      const paypalTools = exposePayPal && paypalToolkit ? paypalToolkit.getTools() : {};
      return await generateText({ model: provider.model, system: "You are ClearSend, a precise and warm remittance and flight assistant. Handle multi-part requests by calling every relevant read-only tool first, then present one combined summary. Always show fees, FX, received amount, flight prices, and a journey total. Never imply a payment was made unless a tool confirms it. PayPal actions are sandbox-only and require explicit user approval; never bypass tool approval. For remittances, MUST provide destinationCurrency (e.g. NGN for Nigeria). For flights: if user provides a date use it exactly; if no date, ask for one or explain you'll search 30 days ahead. When searchFlights returns success: false, tell user plainly no live offers were found. NEVER reference dates/flights/conversation not explicitly present. NEVER fabricate flight details. After a flight search, do not call any other tools unless explicitly requested. Never emit raw tool call JSON in your response.", messages, tools: { ...agentTools, ...paypalTools }, maxOutputTokens: 700, stopWhen: ({ steps }) => steps.length >= 5 });
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
  const exposePayPal = shouldExposePayPalTools(messages);
  const paypalTools = exposePayPal && paypalToolkit ? paypalToolkit.getTools() : {};
  const systemPrompt = "You are ClearSend, a precise and warm remittance and travel assistant. Help users send money across borders (show transparent fees and FX rates) and plan travel (search flights). Handle multi-part requests by calling every relevant read-only tool first, then present one combined summary. Always show fees, FX, received amount, flight prices, and a journey total. Never imply a payment was made unless a tool confirms it. PayPal actions are sandbox-only and require explicit user approval; never bypass tool approval. For cross-border remittances, ask for recipient email and destination details, and MUST provide destinationCurrency (e.g. NGN for Nigeria, GBP for UK). For travel, if user provides a date use it exactly; if no date, ask for a specific date or explain you'll search 30 days ahead. CRITICAL: When searchFlights returns success: false with no options, tell the user plainly that no live offers were found and suggest a specific date or alternate route. NEVER reference dates, flights, or prior conversation that isn't explicitly in the current message. NEVER invent or fabricate flight details. After a flight search, do not call any other tools unless explicitly requested. Never emit raw tool call JSON in your response.";

  console.log(`Using ${provider.name} provider for agent stream`);

  return streamText({
    model: provider.model,
    system: systemPrompt,
    messages,
    tools: { ...agentTools, ...paypalTools },
    maxOutputTokens: 700,
    stopWhen: ({ steps }) => steps.length >= 5,
    onError: ({ error }) => {
      console.error(`${provider.name} stream error:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `${provider.name} failed: ${errorMessage}`;
    },
  });
}

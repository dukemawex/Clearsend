import { createOpenAI } from "@ai-sdk/openai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { generateText, tool } from "ai";
import { z } from "zod";
import { createOrder, createPayout, getOrder, getPayoutStatus } from "@/lib/paypal";

const nvidia = createOpenAI({ apiKey: process.env.NVIDIA_API_KEY ?? "not-configured", baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1" });
const paypalToolkit = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? new PayPalAgentToolkit({ clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET, configuration: { context: { sandbox: true }, actions: { orders: { create: true, get: true }, invoices: { create: true, get: true, list: true }, products: { create: true, list: true }, disputes: { list: true, get: true } } } }) : null;

const corridors = {
  Nairobi: [{ airline: "Kenya Airways", route: "JFK → NBO", depart: "08:40", arrive: "06:15 +1", price: 684 }, { airline: "Qatar Airways", route: "JFK → NBO", depart: "21:55", arrive: "20:05 +1", price: 741 }],
  Manila: [{ airline: "ANA", route: "SFO → MNL", depart: "13:20", arrive: "19:10 +1", price: 592 }, { airline: "Philippine Airlines", route: "LAX → MNL", depart: "23:45", arrive: "05:30 +2", price: 618 }],
  "Mexico City": [{ airline: "Aeromexico", route: "LAX → MEX", depart: "10:15", arrive: "15:25", price: 289 }, { airline: "Volaris", route: "ORD → MEX", depart: "07:30", arrive: "11:15", price: 247 }],
  Accra: [{ airline: "Delta", route: "JFK → ACC", depart: "20:35", arrive: "10:20 +1", price: 803 }, { airline: "British Airways", route: "JFK → ACC", depart: "18:10", arrive: "17:45 +1", price: 856 }],
} as const;

export const agentTools = {
  calculateRemittance: tool({ description: "Calculate a transparent remittance breakdown. Fee is 2.5% and FX includes a 1.2% spread over the mid-market rate.", inputSchema: z.object({ amount: z.number().positive(), destination: z.string(), midMarketRate: z.number().positive().default(1) }), execute: async ({ amount, destination, midMarketRate }) => { const fee = amount * 0.025; const fxRate = midMarketRate * 0.988; return { amountSent: amount, fee: Number(fee.toFixed(2)), fxRate: Number(fxRate.toFixed(4)), amountReceived: Number(((amount - fee) * fxRate).toFixed(2)), destination, currency: destination.toLowerCase().includes("nairobi") ? "KES" : destination.toLowerCase().includes("manila") ? "PHP" : "USD" }; } }),
  searchFlights: tool({ description: "Search realistic mock flights for a common corridor.", inputSchema: z.object({ destination: z.string(), origin: z.string().default("JFK"), date: z.string().optional() }), execute: async ({ destination, origin, date }) => { const key = Object.keys(corridors).find((name) => destination.toLowerCase().includes(name.toLowerCase())); return { origin, destination, date: date ?? "flexible", options: key ? corridors[key as keyof typeof corridors] : [{ airline: "ClearSend Air", route: `${origin} → ${destination}`, depart: "09:30", arrive: "17:45", price: 499 }] }; } }),
  createRemittance: tool({ description: "Create a PayPal sandbox payout after the user has confirmed the amount and recipient.", inputSchema: z.object({ recipientEmail: z.string().email(), amount: z.number().positive(), currency: z.string().length(3).default("USD"), note: z.string().optional() }), execute: async (input) => createPayout(input) }),
  createFlightOrder: tool({ description: "Create a PayPal sandbox order for a selected flight.", inputSchema: z.object({ amount: z.number().positive(), description: z.string() }), execute: async (input) => createOrder(input) }),
  checkPaymentStatus: tool({ description: "Check the status of a PayPal payout batch or order.", inputSchema: z.object({ id: z.string(), kind: z.enum(["payout", "order"]) }), execute: async ({ id, kind }) => kind === "payout" ? getPayoutStatus(id) : getOrder(id) }),
};

export async function runAgent(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  const model = process.env.NVIDIA_API_KEY ? nvidia(process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b") : nvidia("nvidia/nemotron-3-ultra-550b-a55b");
  return generateText({ model, system: "You are ClearSend, a precise and warm remittance and flight assistant. Always show fees and FX clearly. Never imply a payment was made unless a tool confirms it. PayPal actions are sandbox-only and require user confirmation in the conversation.", messages, tools: { ...agentTools, ...(paypalToolkit?.getTools() ?? {}) }, maxOutputTokens: 700, stopWhen: ({ steps }) => steps.length >= 5 });
}
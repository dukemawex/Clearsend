import { NextResponse } from "next/server";
import { agentTools } from "@/lib/agent";
import { recentActivity } from "@/lib/chatbots/store";
import { loadReceipt } from "@/lib/receipt-access";
import { getEscrow } from "@/lib/escrow";
import { getTrip } from "@/lib/trips";
import { runAsOwner } from "@/lib/owner";

function chatBotsInfo() {
  const base = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") ? process.env.NEXT_PUBLIC_APP_URL : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
  const tg = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return {
    telegram: { configured: !!(tg && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET), addToGroup: tg ? `https://t.me/${tg}?startgroup=true` : null, webhook: base ? `${base}/api/telegram/webhook` : null },
    docs: "https://github.com/dukemawex/Clearsend#readme",
  };
}

export const runtime = "nodejs";

/**
 * MCP-over-HTTP endpoint exposing ClearSend's PayPal-backed tools
 * Protected by x-clearsend-api-key header
 */
export async function POST(request: Request) {
  const apiKey = process.env.CLEAR_SEND_API_KEY;
  
  // Verify API key if configured
  if (apiKey) {
    const providedKey = request.headers.get("x-clearsend-api-key");
    if (!providedKey || providedKey !== apiKey) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid x-clearsend-api-key header." },
        { status: 401 }
      );
    }
  } else {
    console.warn("mcp_endpoint_unprotected: CLEAR_SEND_API_KEY is not set. This endpoint is unprotected.");
  }

  try {
    const body = await request.json();
    const { method, params } = body;

    // MCP protocol: list tools
    if (method === "tools/list") {
      const tools = [
        {
          name: "calculateRemittance",
          description: "Calculate transparent remittance breakdown with fees and FX rates. Fee is 2.5%, FX includes 1.2% spread.",
          inputSchema: {
            type: "object",
            properties: {
              amount: { type: "number", description: "Amount to send in source currency" },
              destination: { type: "string", description: "Destination country or location" },
              currency: { type: "string", description: "Source currency code (e.g., USD)", default: "USD" },
              midMarketRate: { type: "number", description: "Mid-market exchange rate", default: 1 },
              receiveCurrency: { type: "string", description: "Destination currency code (e.g., NGN)", default: "NGN" }
            },
            required: ["amount", "destination"]
          }
        },
        {
          name: "searchFlights",
          description: "Search worldwide flight offers using real-time flight APIs. Returns sorted offers with cheapest marked.",
          inputSchema: {
            type: "object",
            properties: {
              origin: { type: "string", description: "Origin airport IATA code or city name" },
              destination: { type: "string", description: "Destination airport IATA code or city name" },
              date: { type: "string", description: "Departure date in YYYY-MM-DD format (optional)" }
            },
            required: ["origin", "destination"]
          }
        },
        {
          name: "createPayout",
          description: "Create a PayPal sandbox payout. Requires approval. Only use after user explicitly approves the remittance breakdown.",
          inputSchema: {
            type: "object",
            properties: {
              recipientEmail: { type: "string", format: "email", description: "PayPal recipient email" },
              amount: { type: "number", description: "Amount to send" },
              currency: { type: "string", description: "Currency code (e.g., USD)", default: "USD" },
              note: { type: "string", description: "Optional note for recipient" }
            },
            required: ["recipientEmail", "amount"]
          }
        },
        {
          name: "createOrder",
          description: "Create a PayPal sandbox order for payment. Returns approval URL for user to complete payment.",
          inputSchema: {
            type: "object",
            properties: {
              amount: { type: "number", description: "Order amount" },
              description: { type: "string", description: "Order description" }
            },
            required: ["amount", "description"]
          }
        },
        {
          name: "getStatus",
          description: "Check the status of a PayPal payout batch or order by ID.",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "PayPal batch ID or order ID" },
              kind: { type: "string", enum: ["payout", "order"], description: "Type of resource to check" }
            },
            required: ["id", "kind"]
          }
        },
        {
          name: "createEscrow",
          description: "Create a PayPal sandbox escrow for secure payment with deliverable verification. Use for freelance jobs, service agreements, or any transaction requiring proof of delivery before release. After creation, the payer can attach a spec document and the recipient a deliverable document (PDF/DOCX/TXT/image, 5 MB) via POST /api/escrow/upload (multipart: escrowId, role, token, kind=spec|deliverable, file); the AI verifier reads the extracted text as untrusted data.",
          inputSchema: {
            type: "object",
            properties: {
              payer: { type: "string", description: "Payer name" },
              payerEmail: { type: "string", format: "email", description: "Payer email" },
              recipient: { type: "string", description: "Recipient name" },
              recipientEmail: { type: "string", format: "email", description: "Recipient email (optional)" },
              recipientPayerId: { type: "string", description: "Recipient PayPal ID (optional)" },
              recipientCountry: { type: "string", description: "Recipient country" },
              amount: { type: "number", description: "Escrow amount" },
              currency: { type: "string", description: "Currency code (e.g., USD)", default: "USD" },
              specification: { type: "string", description: "Detailed specification of deliverable" },
              acceptanceCriteria: { type: "array", items: { type: "string" }, description: "Optional acceptance criteria" }
            },
            required: ["payer", "payerEmail", "recipient", "recipientCountry", "amount", "specification"]
          }
        },
        {
          name: "getEscrow",
          description: "Get the current state and details of an escrow by ID. Shows state, timeline, amounts, specification, deliverable (if submitted), and evaluation results.",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Escrow ID" }
            },
            required: ["id"]
          }
        },
        {
          name: "listEscrows",
          description: "List all escrows in the system, ordered by creation date (newest first).",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "chatBotsInfo",
          description: "Read-only. Whether the Telegram escrow bot is configured, its add-to-group link and webhook URL.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "getReceipt",
          description: "Read-only. Fetch a PayPal sandbox payment receipt by receipt id (rcpt_funding_|rcpt_payout_|rcpt_refund_ + escrow or trip id), or list all receipts for an escrowId/tripId. Receipts exist only after a real sandbox capture, payout or refund.",
          inputSchema: { type: "object", properties: { id: { type: "string", description: "Receipt id" }, escrowId: { type: "string" }, tripId: { type: "string" } } }
        },
        {
          name: "listChatEscrowActivity",
          description: "Read-only. Recent escrow actions taken from Telegram groups and DMs (create, join, fund, submit, verify, release, refund). No message content or secrets.",
          inputSchema: { type: "object", properties: { limit: { type: "number", description: "Max entries (1-100), default 25" } } }
        }
      ];

      return NextResponse.json({ tools });
    }

    // MCP protocol: call tool
    if (method === "tools/call") {
      const { name, arguments: args } = params;
      // Without CLEAR_SEND_API_KEY the endpoint is unauthenticated: never return stored records then.
      if (!apiKey && ["getReceipt", "listChatEscrowActivity", "getEscrow", "listEscrows"].includes(name)) {
        return NextResponse.json({ error: "Data tools need CLEAR_SEND_API_KEY to be configured and sent as x-clearsend-api-key." }, { status: 401 });
      }

      if (name === "getReceipt") {
        let result: unknown;
        if (args?.id) {
          const r = await loadReceipt(String(args.id), { serviceKey: process.env.CLEAR_SEND_API_KEY ?? null });
          result = r.status === 200 ? r.receipt : { error: r.error };
        } else if (args?.escrowId || args?.tripId) {
          const rec = args.escrowId ? await getEscrow(String(args.escrowId)) : await getTrip(String(args.tripId));
          result = rec ? { receipts: rec.receipts ?? [] } : { error: "Not found" };
        } else result = { error: "Provide id, escrowId or tripId" };
        return NextResponse.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], _meta: { provider: "clearsend", sandbox: true } });
      }

      if (name === "chatBotsInfo" || name === "listChatEscrowActivity") {
        const result = name === "chatBotsInfo" ? chatBotsInfo() : { activity: await recentActivity(Math.min(100, Math.max(1, Number(args?.limit) || 25))) };
        return NextResponse.json({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], _meta: { provider: "clearsend", sandbox: true } });
      }

      // Route to the appropriate tool
      const tool = agentTools[name as keyof typeof agentTools];
      if (!tool) {
        return NextResponse.json(
          { error: `Unknown tool: ${name}` },
          { status: 404 }
        );
      }

      // Execute the tool - AI SDK tools have an execute function that expects
      // the input parameters and an optional AbortSignal
      const startTime = Date.now();
      let result;
      try {
        // Call the execute function with the args and an empty options object
        // Agent tools run as the MCP owner: list/get only see escrows created over MCP, never browser or Telegram data.
        result = await runAsOwner("mcp:service", () => (tool.execute as (input: unknown, options?: { abortSignal?: AbortSignal }) => Promise<unknown>)(args, {}));
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Tool execution failed" },
          { status: 500 }
        );
      }
      const latencyMs = Date.now() - startTime;

      return NextResponse.json({
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        _meta: {
          latencyMs,
          provider: "clearsend",
          sandbox: true
        }
      });
    }

    return NextResponse.json(
      { error: "Unsupported MCP method. Supported: tools/list, tools/call" },
      { status: 400 }
    );

  } catch (error) {
    console.error("mcp_endpoint_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "MCP request failed" },
      { status: 500 }
    );
  }
}

// Support GET for discovery
export async function GET() {
  return NextResponse.json({
    name: "ClearSend PayPal Agent Tools",
    version: "1.0.0",
    description: "Agent-readable endpoint exposing ClearSend's PayPal-backed remittance, travel, and escrow tools.",
    protocol: "mcp-over-http",
    capabilities: {
      tools: true,
      remittance: true,
      flights: true,
      paypal: true,
      sandbox: true
    },
    authentication: "x-clearsend-api-key header required (if CLEAR_SEND_API_KEY is configured)",
    endpoints: {
      "tools/list": "POST /api/mcp with { method: 'tools/list' }",
      "tools/call": "POST /api/mcp with { method: 'tools/call', params: { name, arguments } }"
    },
    example: {
      calculateRemittance: {
        method: "tools/call",
        params: {
          name: "calculateRemittance",
          arguments: { amount: 500, destination: "Lagos, Nigeria", currency: "USD", midMarketRate: 1348.45, receiveCurrency: "NGN" }
        }
      }
    }
  });
}

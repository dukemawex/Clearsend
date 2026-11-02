import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Agent discovery endpoint following the .well-known standard
 */
export async function GET(request: Request) {
  // Build base URL from request origin or environment variables
  // Never use localhost in production
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  
  if (!baseUrl) {
    const origin = new URL(request.url).origin;
    // Only use request origin if it's not localhost
    if (!origin.includes("localhost")) {
      baseUrl = origin;
    }
  }
  
  // Add https:// prefix for Vercel URLs
  if (baseUrl && !baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  
  // Fallback to localhost only in development
  if (!baseUrl) {
    baseUrl = "http://localhost:3000";
  }
  
  return NextResponse.json({
    name: "ClearSend",
    description: "Cross-border remittance and travel planning with transparent fees, powered by PayPal + AI",
    version: "1.0.0",
    capabilities: [
      "remittance",
      "flight-search",
      "paypal-payouts",
      "paypal-orders",
      "escrow",
      "cross-border-payments"
    ],
    endpoints: {
      mcp: {
        url: `${baseUrl}/api/mcp`,
        protocol: "mcp-over-http",
        methods: ["tools/list", "tools/call"],
        authentication: "x-clearsend-api-key"
      },
      agent: {
        url: `${baseUrl}/api/agent`,
        protocol: "streaming-chat",
        description: "AI agent for conversational remittance and travel planning"
      }
    },
    provider: {
      name: "ClearSend",
      url: baseUrl,
      sandbox: true,
      paypal_sandbox: true
    },
    tools: [
      {
        name: "calculateRemittance",
        category: "remittance",
        description: "Calculate transparent remittance breakdown with fees and FX rates",
        needsApproval: false
      },
      {
        name: "searchFlights",
        category: "travel",
        description: "Search worldwide flight offers using real-time APIs",
        needsApproval: false
      },
      {
        name: "createPayout",
        category: "remittance",
        description: "Create PayPal sandbox payout",
        needsApproval: true,
        sandbox: true
      },
      {
        name: "createOrder",
        category: "payment",
        description: "Create PayPal sandbox order for payment",
        needsApproval: true,
        sandbox: true
      },
      {
        name: "getStatus",
        category: "status",
        description: "Check PayPal payout or order status",
        needsApproval: false,
        sandbox: true
      },
      {
        name: "createEscrow",
        category: "escrow",
        description: "Create a PayPal sandbox escrow for secure payment with deliverable verification",
        needsApproval: true,
        sandbox: true
      },
      {
        name: "getEscrow",
        category: "escrow",
        description: "Get the current state and details of an escrow by ID",
        needsApproval: false,
        sandbox: true
      },
      {
        name: "listEscrows",
        category: "escrow",
        description: "List all escrows in the system",
        needsApproval: false,
        sandbox: true
      }
    ],
    security: {
      authentication: "API key via x-clearsend-api-key header",
      sandbox_only: true,
      approval_required_for_money_movement: true
    },
    links: {
      documentation: `${baseUrl}/judges`,
      github: "https://github.com/dukemawex/Clearsend"
    }
  });
}

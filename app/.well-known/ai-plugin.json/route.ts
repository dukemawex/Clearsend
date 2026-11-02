import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Agent discovery endpoint following the .well-known standard
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
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

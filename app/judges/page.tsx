import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Judges - ClearSend PayPal AI Hackathon",
  description: "PayPal + AI architecture, capabilities, and sandbox walkthrough for ClearSend"
};

export default function JudgesPage() {
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "48px" }}>
        <h1 style={{ fontSize: "36px", fontWeight: "700", marginBottom: "16px" }}>
          ClearSend: PayPal + AI Integration
        </h1>
        <p style={{ fontSize: "18px", color: "#6b7280", lineHeight: "1.6" }}>
          Deep integration of PayPal&apos;s agentic commerce capabilities for cross-border remittance, travel planning, and escrow
        </p>
      </header>

      <section style={{ marginBottom: "48px", padding: "24px", background: "#f9fafb", borderRadius: "8px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>🎯 Core Concept</h2>
        <p style={{ fontSize: "16px", lineHeight: "1.6", marginBottom: "16px" }}>
          ClearSend demonstrates <strong>PayPal + AI</strong> by building an autonomous agent that handles real money movement 
          with human-in-the-loop approval. Every PayPal action flows through the agent toolkit, is tracked in real-time, 
          and requires explicit user consent before execution.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px", marginTop: "24px" }}>
          <div style={{ padding: "16px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <strong style={{ display: "block", marginBottom: "8px", color: "#1f2937" }}>✅ Real PayPal APIs</strong>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>Sandbox Orders, Payouts, Invoices, Products, Disputes</p>
          </div>
          <div style={{ padding: "16px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <strong style={{ display: "block", marginBottom: "8px", color: "#1f2937" }}>✅ Agent Toolkit</strong>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>@paypal/agent-toolkit for AI SDK integration</p>
          </div>
          <div style={{ padding: "16px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <strong style={{ display: "block", marginBottom: "8px", color: "#1f2937" }}>✅ No Mock Data</strong>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>All transactions hit real PayPal sandbox endpoints</p>
          </div>
          <div style={{ padding: "16px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <strong style={{ display: "block", marginBottom: "8px", color: "#1f2937" }}>✅ Agent-Readable</strong>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>MCP endpoint exposes tools for external agents</p>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "48px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "24px" }}>🏗️ Architecture</h2>
        
        <div style={{ background: "#1f2937", color: "#f9fafb", padding: "24px", borderRadius: "8px", fontSize: "13px", fontFamily: "monospace", overflow: "auto", marginBottom: "24px" }}>
          <pre style={{ margin: 0 }}>{`
┌─────────────────────────────────────────────────────────────────────────┐
│                           ClearSend Agent Layer                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐   │
│  │  AI SDK Stream  │  │  PayPal Toolkit  │  │  Custom Remittance  │   │
│  │  (OpenAI API)   │→ │  @paypal/agent-  │→ │  Flight + Escrow    │   │
│  │  NVIDIA / OR    │  │  toolkit         │  │  Tools              │   │
│  └─────────────────┘  └──────────────────┘  └─────────────────────┘   │
│                                 ↓                                        │
│                    ┌────────────────────────────┐                       │
│                    │  Approval Gate (UI)        │                       │
│                    │  Human-in-the-Loop         │                       │
│                    └────────────────────────────┘                       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         PayPal Sandbox APIs                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Orders API   │  │ Payouts API  │  │ Invoices API │  │ Products   │ │
│  │ create       │  │ create       │  │ create       │  │ create     │ │
│  │ capture      │  │ get status   │  │ send         │  │ list       │ │
│  │ get          │  │              │  │ list         │  │            │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    External Agent Integration                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MCP-over-HTTP Endpoint                                         │   │
│  │  GET  /.well-known/ai-plugin.json  → Agent discovery           │   │
│  │  POST /api/mcp                     → Tool execution             │   │
│  │                                                                  │   │
│  │  Protected by x-clearsend-api-key header                        │   │
│  │  Exposes: calculateRemittance, searchFlights, createPayout,     │   │
│  │          createOrder, getStatus                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
`}</pre>
        </div>

        <h3 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px" }}>Key Architecture Decisions</h3>
        <ul style={{ fontSize: "16px", lineHeight: "1.8", color: "#374151" }}>
          <li><strong>PayPal Agent Toolkit:</strong> All PayPal operations routed through @paypal/agent-toolkit for native AI SDK integration</li>
          <li><strong>Approval Gate:</strong> ApprovalBar component blocks all money-moving actions until user explicitly approves</li>
          <li><strong>Activity Timeline:</strong> PayPalActivityPanel tracks every tool call with sanitized args, PayPal IDs, status, and latency</li>
          <li><strong>MCP Endpoint:</strong> /api/mcp exposes tools for external agents using MCP-over-HTTP protocol</li>
          <li><strong>Agent Discovery:</strong> /.well-known/ai-plugin.json advertises capabilities and endpoints</li>
          <li><strong>Real Data:</strong> No mocks—flight APIs (Duffel, RapidAPI Sky Scrapper), real PayPal sandbox, live FX calculations</li>
        </ul>
      </section>

      <section style={{ marginBottom: "48px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>🔧 PayPal APIs & Tools Used</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
          <div style={{ padding: "24px", background: "#f0fdf4", borderRadius: "8px", border: "2px solid #86efac" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#166534" }}>Orders API</h3>
            <p style={{ fontSize: "14px", color: "#166534", marginBottom: "12px" }}>
              Create and capture PayPal orders for flight bookings and escrow deposits
            </p>
            <ul style={{ fontSize: "14px", color: "#166534", lineHeight: "1.8", paddingLeft: "20px" }}>
              <li>POST /v2/checkout/orders (create)</li>
              <li>POST /v2/checkout/orders/:id/capture</li>
              <li>GET /v2/checkout/orders/:id</li>
            </ul>
          </div>

          <div style={{ padding: "24px", background: "#eff6ff", borderRadius: "8px", border: "2px solid #93c5fd" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#1e40af" }}>Payouts API</h3>
            <p style={{ fontSize: "14px", color: "#1e40af", marginBottom: "12px" }}>
              Cross-border remittances and escrow releases via PayPal Payouts
            </p>
            <ul style={{ fontSize: "14px", color: "#1e40af", lineHeight: "1.8", paddingLeft: "20px" }}>
              <li>POST /v1/payments/payouts (create)</li>
              <li>GET /v1/payments/payouts/:id (status)</li>
            </ul>
          </div>

          <div style={{ padding: "24px", background: "#fef3c7", borderRadius: "8px", border: "2px solid #fcd34d" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#92400e" }}>Agent Toolkit</h3>
            <p style={{ fontSize: "14px", color: "#92400e", marginBottom: "12px" }}>
              @paypal/agent-toolkit integration for AI SDK
            </p>
            <ul style={{ fontSize: "14px", color: "#92400e", lineHeight: "1.8", paddingLeft: "20px" }}>
              <li>paypal_create_order</li>
              <li>paypal_get_order</li>
              <li>paypal_create_invoice</li>
              <li>paypal_send_invoice</li>
              <li>paypal_list_invoices</li>
              <li>paypal_create_product</li>
              <li>paypal_list_products</li>
              <li>paypal_list_disputes</li>
              <li>paypal_get_dispute</li>
            </ul>
          </div>

          <div style={{ padding: "24px", background: "#fae8ff", borderRadius: "8px", border: "2px solid #e9d5ff" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#6b21a8" }}>Custom Tools</h3>
            <p style={{ fontSize: "14px", color: "#6b21a8", marginBottom: "12px" }}>
              ClearSend-specific tools built on PayPal
            </p>
            <ul style={{ fontSize: "14px", color: "#6b21a8", lineHeight: "1.8", paddingLeft: "20px" }}>
              <li>calculateRemittance (with displayStrings)</li>
              <li>searchFlights (multi-provider with failover)</li>
              <li>createPayout (approval-gated)</li>
              <li>createOrder (approval-gated)</li>
              <li>captureOrder</li>
              <li>getStatus (unified payout/order)</li>
            </ul>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "48px", padding: "24px", background: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px", color: "#0c4a6e" }}>✈️ Flight Data Sources & Honest Pricing Policy</h2>
        
        <p style={{ fontSize: "16px", lineHeight: "1.6", marginBottom: "16px", color: "#0c4a6e" }}>
          <strong>ClearSend NEVER fabricates prices.</strong> Flight offers are clearly labeled and the agent is honest about availability:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ padding: "16px", background: "#dcfce7", borderRadius: "8px", border: "2px solid #86efac" }}>
            <strong style={{ display: "block", marginBottom: "8px", color: "#166534" }}>✅ Priced Offers (RapidAPI, Duffel)</strong>
            <p style={{ fontSize: "14px", color: "#166534", margin: 0 }}>Real fares with prices - can be booked with PayPal</p>
          </div>
          <div style={{ padding: "16px", background: "#fef3c7", borderRadius: "8px", border: "2px solid #fcd34d" }}>
            <strong style={{ display: "block", marginBottom: "8px", color: "#92400e" }}>⚠️ Schedule-Only (Aviationstack, OpenSky, OpenFlights)</strong>
            <p style={{ fontSize: "14px", color: "#92400e", margin: 0 }}>No pricing data - labeled &quot;schedule only - fare unavailable&quot;</p>
          </div>
        </div>

        <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#0c4a6e" }}>Flight Provider Chain (in order)</h3>
        <ol style={{ fontSize: "15px", lineHeight: "1.8", color: "#0c4a6e", paddingLeft: "24px" }}>
          <li><strong>RapidAPI Sky Scrapper</strong> - Real-time pricing with exponential backoff retry (up to 6 retries), Retry-After header support, 10-minute caching</li>
          <li><strong>Duffel</strong> - Test/sample flight data (priced in test mode)</li>
          <li><strong>Aviationstack</strong> - Live flight status, date-filtered (schedule only, price: null)</li>
          <li><strong>OpenSky Network</strong> - Free real recent/live flights by ICAO airport, anonymous or optional credentials (schedule only, price: null)</li>
          <li><strong>OpenFlights</strong> - Free route database from GitHub, confirms which airlines fly which routes, typical stops (schedule only, price: null)</li>
        </ol>

        <h3 style={{ fontSize: "18px", fontWeight: "600", marginTop: "24px", marginBottom: "12px", color: "#0c4a6e" }}>Honesty Rules</h3>
        <ul style={{ fontSize: "15px", lineHeight: "1.8", color: "#0c4a6e", paddingLeft: "24px" }}>
          <li>✅ <strong>Agent explains when fares are unavailable</strong> and offers to retry with priced providers</li>
          <li>✅ <strong>Booking requires a priced offer</strong> - agent rejects schedule-only flights for PayPal checkout</li>
          <li>✅ <strong>Schedule-only offers labeled clearly</strong> with &quot;schedule only - fare unavailable&quot; message</li>
          <li>✅ <strong>No fabricated prices</strong> - if price is null, it stays null and is explained to the user</li>
          <li>❌ <strong>Agent will NOT</strong> attempt to book or charge PayPal for schedule-only flights</li>
          <li>❌ <strong>Agent will NOT</strong> invent or guess prices</li>
        </ul>

        <h3 style={{ fontSize: "18px", fontWeight: "600", marginTop: "24px", marginBottom: "12px", color: "#0c4a6e" }}>Sky-Scrapper 429 Resilience</h3>
        <ul style={{ fontSize: "15px", lineHeight: "1.8", color: "#0c4a6e", paddingLeft: "24px" }}>
          <li>Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s (up to 6 retries)</li>
          <li>Honors <code>Retry-After</code> header when rate limited</li>
          <li>In-memory cache (10 min TTL) for airport lookups and search results</li>
          <li>Clear error messages when quota exhausted (no misleading &quot;complete&quot; status)</li>
        </ul>
      </section>

      <section style={{ marginBottom: "48px", padding: "24px", background: "#eff8ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px", color: "#003087" }}>🎙 Voice + 📎 Documents in the PayPal agentic flow</h2>
        <ul style={{ lineHeight: 1.8, paddingLeft: "20px" }}>
          <li><strong>Hold-to-talk:</strong> in the agent chat (home page), hold 🎙 and speak. The live transcript appears above the composer and you can edit it before sending. Uses the browser Web Speech API (Chrome desktop/Android, Safari iOS); other browsers show a clear fallback message. Language selector: en-NG, en-US, en-GB, fr-FR, es-ES, pt-BR, yo-NG, ha-NG, sw-KE (availability depends on the browser).</li>
          <li><strong>Spoken replies:</strong> tick “🔊 Speak replies” to hear each agent answer via speechSynthesis; “■ Stop speaking” cuts it off. No paid voice services.</li>
          <li><strong>Attach in chat:</strong> 📎 accepts PDF, DOCX, TXT/MD, PNG/JPG/WEBP up to 5 MB. <code>/api/documents/extract</code> pulls the text (unpdf, mammoth, tesseract.js OCR for images when the server can run it) and the agent receives it fenced as untrusted data, e.g. a job spec to turn into an escrow.</li>
          <li><strong>Escrow documents:</strong> on the payer link, upload a spec; on the recipient link, upload the deliverable. <code>/api/escrow/upload</code> checks the HMAC role token, sanitizes filenames, checks file signatures, never executes content, and stores the extracted text in the escrow record (Upstash Redis). The AI verifier compares the real deliverable text against the spec, with a prompt-injection guard, before the payer can release a PayPal payout.</li>
          <li><strong>Unchanged guards:</strong> PayPal sandbox only; every money-moving action still needs the approval bar or typed confirmation.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "48px", padding: "24px", background: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px", color: "#991b1b" }}>🧪 Sandbox Test Walkthrough</h2>
        
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#991b1b" }}>Prerequisites</h3>
          <ol style={{ fontSize: "15px", lineHeight: "1.8", color: "#7f1d1d", paddingLeft: "24px" }}>
            <li>PayPal Developer Account at <a href="https://developer.paypal.com" style={{ color: "#991b1b", textDecoration: "underline" }}>developer.paypal.com</a></li>
            <li>Create a Sandbox App under Apps & Credentials → Sandbox</li>
            <li>Copy Client ID and Secret to <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code></li>
            <li>Create a Sandbox Personal Account under Sandbox → Accounts (for receiving payouts)</li>
            <li>Set <code>NVIDIA_API_KEY</code> or <code>OPENROUTER_API_KEY</code> for the AI agent</li>
            <li>Optional: <code>RAPIDAPI_KEY</code> for flight search (Sky Scrapper)</li>
          </ol>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#991b1b" }}>Test Flow 1: Cross-Border Remittance</h3>
          <ol style={{ fontSize: "15px", lineHeight: "1.8", color: "#7f1d1d", paddingLeft: "24px" }}>
            <li>Open ClearSend at <a href="https://clearsend-sigma.vercel.app" style={{ color: "#991b1b", textDecoration: "underline" }}>clearsend-sigma.vercel.app</a></li>
            <li>Type: <strong>&quot;Send $500 to Lagos, Nigeria with transparent fees&quot;</strong></li>
            <li>Agent calls <code>calculateRemittance</code> and shows:
              <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
                <li>Send Amount: USD 500.00</li>
                <li>Fee: USD 12.50 (2.5%)</li>
                <li>Total Charged: USD 500.00</li>
                <li>Rate: 1 USD = 1,348.45 NGN (with 1.2% spread)</li>
                <li>Receive Amount: NGN 657,381.15</li>
              </ul>
            </li>
            <li>Agent asks for recipient email: provide your sandbox Personal account email (e.g., <code>sb-test123@personal.example.com</code>)</li>
            <li>Approval bar appears: click <strong>&quot;Approve action&quot;</strong></li>
            <li>Agent calls <code>createPayout</code> → PayPal Payouts API</li>
            <li>Check sandbox account: payout should appear as pending/completed</li>
            <li>PayPal Activity Panel shows: <code>createPayout</code> → batch ID → status → latency</li>
          </ol>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#991b1b" }}>Test Flow 2: Travel Booking</h3>
          <ol style={{ fontSize: "15px", lineHeight: "1.8", color: "#7f1d1d", paddingLeft: "24px" }}>
            <li>Type: <strong>&quot;Search flights from New York to Lagos&quot;</strong></li>
            <li>Agent calls <code>searchFlights</code> → hits RapidAPI Sky Scrapper (or Duffel if configured)</li>
            <li>Agent shows flight offers sorted by price, with cheapest marked</li>
            <li>Type: <strong>&quot;Book the cheapest one&quot;</strong></li>
            <li>Agent calls <code>createOrder</code> for the selected flight amount</li>
            <li>Approval bar appears: click <strong>&quot;Approve action&quot;</strong></li>
            <li>Agent returns PayPal approval URL: open it in a new tab</li>
            <li>Log in with sandbox Business account credentials and approve</li>
            <li>Return to ClearSend, confirm approval</li>
            <li>Agent calls <code>captureOrder</code> → order captured</li>
            <li>PayPal Activity Panel tracks: <code>createOrder</code> → order ID → <code>captureOrder</code> → captured</li>
          </ol>
        </div>

        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "12px", color: "#991b1b" }}>Test Flow 3: Combined Journey</h3>
          <ol style={{ fontSize: "15px", lineHeight: "1.8", color: "#7f1d1d", paddingLeft: "24px" }}>
            <li>Type: <strong>&quot;Plan a journey: send $500 to Lagos and book a flight from New York to Lagos&quot;</strong></li>
            <li>Agent calls both <code>calculateRemittance</code> and <code>searchFlights</code></li>
            <li>Agent shows combined total: remittance + flight price</li>
            <li>Agent asks for recipient email, then presents separate approval for payout and order</li>
            <li>Approve both actions</li>
            <li>PayPal Activity Panel shows timeline of all operations</li>
          </ol>
        </div>
      </section>

      <section style={{ marginBottom: "48px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>🔌 Agent-Readable Endpoint</h2>
        <p style={{ fontSize: "16px", lineHeight: "1.6", marginBottom: "16px", color: "#374151" }}>
          ClearSend exposes an MCP-over-HTTP endpoint so external agents can call its PayPal-backed tools:
        </p>

        <div style={{ background: "#f9fafb", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>Discovery</h3>
          <pre style={{ fontSize: "13px", fontFamily: "monospace", overflow: "auto" }}>{`GET /.well-known/ai-plugin.json

Returns:
{
  "name": "ClearSend",
  "capabilities": ["remittance", "flight-search", "paypal-payouts", "paypal-orders", "escrow"],
  "endpoints": {
    "mcp": {
      "url": "https://clearsend-sigma.vercel.app/api/mcp",
      "protocol": "mcp-over-http",
      "authentication": "x-clearsend-api-key"
    }
  },
  "tools": [ ... ]
}`}</pre>
        </div>

        <div style={{ background: "#f9fafb", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>List Tools</h3>
          <pre style={{ fontSize: "13px", fontFamily: "monospace", overflow: "auto" }}>{`POST /api/mcp
Content-Type: application/json
x-clearsend-api-key: <your-key>

{
  "method": "tools/list"
}

Returns: { "tools": [ ... ] }`}</pre>
        </div>

        <div style={{ background: "#f9fafb", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>Call Tool</h3>
          <pre style={{ fontSize: "13px", fontFamily: "monospace", overflow: "auto" }}>{`POST /api/mcp
Content-Type: application/json
x-clearsend-api-key: <your-key>

{
  "method": "tools/call",
  "params": {
    "name": "calculateRemittance",
    "arguments": {
      "amount": 500,
      "destination": "Lagos, Nigeria",
      "currency": "USD",
      "midMarketRate": 1348.45,
      "receiveCurrency": "NGN"
    }
  }
}

Returns:
{
  "content": [{
    "type": "text",
    "text": "{\\"amountSent\\": 500, \\"fee\\": 12.5, \\"displayStrings\\": { ... }}"
  }],
  "_meta": { "latencyMs": 42, "provider": "clearsend", "sandbox": true }
}`}</pre>
        </div>
      </section>

      <section style={{ marginBottom: "48px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px" }}>📊 PayPal Activity Timeline</h2>
        <p style={{ fontSize: "16px", lineHeight: "1.6", marginBottom: "16px", color: "#374151" }}>
          The <strong>PayPalActivityPanel</strong> component tracks every PayPal tool call in real-time:
        </p>
        <ul style={{ fontSize: "16px", lineHeight: "1.8", color: "#374151" }}>
          <li><strong>Tool Name:</strong> createPayout, createOrder, paypal_create_invoice, etc.</li>
          <li><strong>Sanitized Args:</strong> Redacts sensitive data (email partially masked, no secrets)</li>
          <li><strong>PayPal IDs:</strong> Batch ID, Order ID, Invoice ID from responses</li>
          <li><strong>Status:</strong> pending → approved → success/failed</li>
          <li><strong>Latency:</strong> Milliseconds from tool call to response</li>
        </ul>
        <p style={{ fontSize: "16px", lineHeight: "1.6", marginTop: "16px", color: "#374151" }}>
          This panel is visible in the right sidebar of the chat interface and expands to show full activity details.
        </p>
      </section>

      <section style={{ marginBottom: "48px", padding: "24px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "16px", color: "#166534" }}>✅ What Makes This PayPal + AI</h2>
        <ol style={{ fontSize: "16px", lineHeight: "1.8", color: "#166534", paddingLeft: "24px" }}>
          <li><strong>Deep PayPal Integration:</strong> Not just one API call—uses Orders, Payouts, Invoices, Products, Disputes via Agent Toolkit</li>
          <li><strong>Agentic Commerce:</strong> Agent autonomously orchestrates multi-step flows: quote → order → approval → capture → payout</li>
          <li><strong>Real Sandbox:</strong> Every transaction hits PayPal sandbox; visible in PayPal Developer Dashboard</li>
          <li><strong>Human-in-the-Loop:</strong> ApprovalBar + approval flow for all money-moving actions</li>
          <li><strong>Activity Transparency:</strong> Live tracking of every PayPal tool call with IDs, status, latency</li>
          <li><strong>Agent-Readable:</strong> MCP endpoint exposes ClearSend&apos;s PayPal tools to external agents</li>
          <li><strong>End-to-End Flows:</strong> Remittance, travel, escrow—complete journeys, not isolated demos</li>
          <li><strong>No Mock Data:</strong> Real flight APIs, real FX calculations, real PayPal responses</li>
        </ol>
      </section>

      <footer style={{ marginTop: "64px", paddingTop: "24px", borderTop: "1px solid #e5e7eb", textAlign: "center", color: "#6b7280" }}>
        <p style={{ fontSize: "14px", marginBottom: "8px" }}>
          Built for the PayPal AI Hackathon • ClearSend by DukeMawex
        </p>
        <p style={{ fontSize: "14px" }}>
          <Link href="/" style={{ color: "#3b82f6", textDecoration: "underline" }}>Try ClearSend</Link>
          {" • "}
          <a href="https://github.com/dukemawex/Clearsend" style={{ color: "#3b82f6", textDecoration: "underline" }}>View on GitHub</a>
        </p>
      </footer>
    </div>
  );
}

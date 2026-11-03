"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ClearSendLogo } from "./clearsend-logo";
import { JourneySummary } from "./JourneySummary";
import { Message } from "./Message";
import { PayPalActivityPanel } from "./PayPalActivityPanel";
import type { Approval, Flight, Remittance, PayPalActivity } from "./journey-types";

const suggestions = ["Send $500 to Lagos, Nigeria with transparent fees", "Search flights from New York to Lagos", "Create an escrow for a freelance job", "Plan a journey: remittance + flight in one conversation"];

// PayPal tool names that we want to track
const PAYPAL_TOOLS = [
  "createPayout", "createOrder", "captureOrder", "getStatus",
  "paypal_create_order", "paypal_get_order", "paypal_capture_order",
  "paypal_create_invoice", "paypal_send_invoice", "paypal_get_invoice", "paypal_list_invoices",
  "paypal_create_product", "paypal_list_products",
  "paypal_list_disputes", "paypal_get_dispute"
];

export function ChatInterface() {
  const { messages, sendMessage, addToolApprovalResponse, status, error } = useChat({ transport: new DefaultChatTransport({ api: "/api/agent" }) });
  const [input, setInput] = useState("");
  const [remittance, setRemittance] = useState<Remittance>();
  const [flight, setFlight] = useState<Flight>();
  const [actionStatus, setActionStatus] = useState<string>();
  const [paypalActivities, setPaypalActivities] = useState<PayPalActivity[]>([]);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const newActivities: PayPalActivity[] = [];
    
    for (const message of messages) {
      for (const part of message.parts as Array<{ type?: string; output?: unknown; toolCallId?: string; input?: unknown }>) {
        const output = part.output as Record<string, unknown> | undefined;
        const toolType = part.type || "";
        
        // Extract tool name from type (e.g., "tool-createPayout" -> "createPayout")
        const toolName = toolType.replace(/^tool-/, "");
        
        // Track remittance data
        if (toolName === "calculateRemittance" && output?.amountSent) {
          setRemittance(output as unknown as Remittance);
        }
        
        // Track flight data
        if (toolName === "searchFlights" && Array.isArray(output?.options)) {
          const cheapestFlight = (output.options as Flight[]).find(f => f.isCheapest) || (output.options as Flight[])[0];
          setFlight(cheapestFlight);
        }
        
        // Track PayPal tool calls
        if (PAYPAL_TOOLS.some(tool => toolName.includes(tool) || toolName.toLowerCase().includes(tool.toLowerCase()))) {
          const input = part.input as Record<string, unknown> | undefined;
          const activityId = part.toolCallId || `${toolName}-${Date.now()}`;
          
          // Check if we already tracked this activity
          const existing = newActivities.find(a => a.id === activityId);
          if (!existing) {
            // Extract PayPal ID from output
            let paypalId: string | undefined;
            if (output?.orderId) paypalId = output.orderId as string;
            else if (output?.batchId) paypalId = output.batchId as string;
            else if (output?.id) paypalId = output.id as string;
            else if (output?.payout_batch_id) paypalId = output.payout_batch_id as string;
            
            // Determine status
            let activityStatus: PayPalActivity["status"] = "pending";
            if (output?.status) {
              const statusStr = (output.status as string).toLowerCase();
              if (statusStr.includes("success") || statusStr === "completed" || statusStr === "captured") {
                activityStatus = "success";
              } else if (statusStr.includes("fail") || statusStr.includes("denied")) {
                activityStatus = "failed";
              } else if (statusStr.includes("approved")) {
                activityStatus = "approved";
              }
            }
            
            newActivities.push({
              id: activityId,
              timestamp: Date.now(),
              toolName,
              args: input || {},
              paypalId,
              status: activityStatus,
              error: output?.error as string | undefined
            });
          }
        }
      }
    }
    
    if (newActivities.length > 0) {
      setPaypalActivities(prev => {
        // Merge new activities with existing ones, avoiding duplicates
        const merged = [...prev];
        for (const newActivity of newActivities) {
          if (!merged.find(a => a.id === newActivity.id)) {
            merged.push(newActivity);
          }
        }
        return merged;
      });
    }
  }, [messages]);

  async function submit(event: React.FormEvent) { event.preventDefault(); const text = input.trim(); if (!text || busy) return; setInput(""); setActionStatus(undefined); await sendMessage({ text }); }
  async function chooseSuggestion(suggestion: string) { if (busy) return; setInput(""); setActionStatus(undefined); await sendMessage({ text: suggestion }); }
  async function quickReply(text: string) { if (busy) return; await sendMessage({ text }); }
  function chooseFlight(option: Flight) { setFlight(option); setActionStatus(`${option.airline} selected for your journey.`); }
  function approve(approval: Approval) { 
    // Mark the activity as approved
    setPaypalActivities(prev => prev.map(a => 
      a.toolName === approval.toolName && a.status === "pending" 
        ? { ...a, status: "approved" } 
        : a
    ));
    addToolApprovalResponse({ id: approval.approvalId, approved: true }); 
    setActionStatus("Approved. ClearSend is completing the sandbox action..."); 
  }

  return <main className="app-shell"><header className="topbar"><div className="brand"><ClearSendLogo compact /><span className="brand-wordmark">ClearSend</span></div><div className="topbar-meta"><span className="live-dot" />Agent online <span className="divider" />PayPal sandbox</div></header><div className="journey-layout"><section className="chat-column"><div className="chat-heading"><div><div className="eyebrow">Personal journey agent</div><h1>Move with clarity.</h1><p>Transparent cross-border money and travel, in one calm conversation.</p></div><span className="secure-badge">⌁ Secure by design</span></div><div className="conversation" aria-live="polite">{messages.length === 0 && <div className="empty-state"><ClearSendLogo /><h2>What journey can ClearSend clarify?</h2><p>Share the people, places, amounts, or plans on your mind. ClearSend will find the next best step.</p><div className="suggestions">{suggestions.map((suggestion) => <button className="suggestion-chip" key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}<span>→</span></button>)}</div></div>}{messages.map((message) => <Message key={message.id} message={message} onApproval={approve} onFlight={chooseFlight} onQuickReply={quickReply} />)}{busy && <div className="thinking"><ClearSendLogo compact /><span>ClearSend is thinking</span><i /><i /><i /></div>}{error && <div className="error-state"><ClearSendLogo compact />{error.message || "ClearSend is temporarily unavailable."}</div>}</div><div className="composer-wrap"><form className="composer" onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder="Tell ClearSend what you need..." aria-label="Tell ClearSend what you need" /><button className="send-button" disabled={busy || !input.trim()} aria-label="Send message">↑</button></form><div className="composer-note"><span>Press Enter to send</span><span>PayPal actions always ask first</span></div></div></section><aside className="side-column"><JourneySummary remittance={remittance} flight={flight} status={actionStatus} /><PayPalActivityPanel activities={paypalActivities} /><div className="trust-note"><ClearSendLogo compact /><div><strong>Clear by design</strong><p>Fees, rates, routes, and approvals stay visible at every step.</p></div></div></aside></div></main>;
}
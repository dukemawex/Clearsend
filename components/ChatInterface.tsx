"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ClearSendLogo } from "./clearsend-logo";
import { JourneySummary } from "./JourneySummary";
import { Message } from "./Message";
import type { Approval, Flight, Remittance } from "./journey-types";

const suggestions = ["Book a flight", "Send money", "Plan a journey"];

export function ChatInterface() {
  const { messages, sendMessage, addToolApprovalResponse, status, error } = useChat({ transport: new DefaultChatTransport({ api: "/api/agent" }) });
  const [input, setInput] = useState("");
  const [remittance, setRemittance] = useState<Remittance>();
  const [flight, setFlight] = useState<Flight>();
  const [actionStatus, setActionStatus] = useState<string>();
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    for (const message of messages) for (const part of message.parts as Array<{ type?: string; output?: unknown }>) {
      const output = part.output as Record<string, unknown> | undefined;
      if (part.type === "tool-calculateRemittance" && output?.amountSent) setRemittance(output as unknown as Remittance);
      if (part.type === "tool-searchFlights" && Array.isArray(output?.options)) setFlight((output.options as Flight[])[0]);
    }
  }, [messages]);

  async function submit(event: React.FormEvent) { event.preventDefault(); const text = input.trim(); if (!text || busy) return; setInput(""); setActionStatus(undefined); await sendMessage({ text }); }
  function chooseSuggestion(suggestion: string) { setInput(suggestion); }
  function chooseFlight(option: Flight) { setFlight(option); setActionStatus(`${option.airline} selected for your journey.`); }
  function approve(approval: Approval) { addToolApprovalResponse({ id: approval.approvalId, approved: true }); setActionStatus("Approved. ClearSend is completing the sandbox action..."); }

  return <main className="app-shell"><header className="topbar"><div className="brand"><ClearSendLogo compact /><span className="brand-wordmark">ClearSend</span></div><div className="topbar-meta"><span className="live-dot" />Agent online <span className="divider" />PayPal sandbox</div></header><div className="journey-layout"><section className="chat-column"><div className="chat-heading"><div><div className="eyebrow">Personal journey agent</div><h1>Move with clarity.</h1><p>Transparent cross-border money and travel, in one calm conversation.</p></div><span className="secure-badge">⌁ Secure by design</span></div><div className="conversation" aria-live="polite">{messages.length === 0 && <div className="empty-state"><ClearSendLogo /><h2>What journey can ClearSend clarify?</h2><p>Share the people, places, amounts, or plans on your mind. ClearSend will find the next best step.</p><div className="suggestions">{suggestions.map((suggestion) => <button className="suggestion-chip" key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}<span>→</span></button>)}</div></div>}{messages.map((message) => <Message key={message.id} message={message} onApproval={approve} onFlight={chooseFlight} />)}{busy && <div className="thinking"><ClearSendLogo compact /><span>ClearSend is thinking</span><i /><i /><i /></div>}{error && <div className="error-state"><ClearSendLogo compact />{error.message || "ClearSend is temporarily unavailable."}</div>}</div><div className="composer-wrap"><form className="composer" onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder="Tell ClearSend what you need..." aria-label="Tell ClearSend what you need" /><button className="send-button" disabled={busy || !input.trim()} aria-label="Send message">↑</button></form><div className="composer-note"><span>Press Enter to send</span><span>PayPal actions always ask first</span></div></div></section><aside className="side-column"><JourneySummary remittance={remittance} flight={flight} status={actionStatus} /><div className="trust-note"><ClearSendLogo compact /><div><strong>Clear by design</strong><p>Fees, rates, routes, and approvals stay visible at every step.</p></div></div></aside></div></main>;
}
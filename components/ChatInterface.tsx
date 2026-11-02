"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { JourneySummary } from "./JourneySummary";
import { Message } from "./Message";
import type { Approval, Flight, Remittance } from "./journey-types";

const quickStarts = ["Send money + book flight", "Check remittance cost", "Book a flight"];
const welcome: UIMessage = { id: "welcome", role: "assistant", parts: [{ type: "text", text: "Hi, I’m ClearSend. Tell me the journey you have in mind and I’ll make the costs clear before anything moves." }] };

export function ChatInterface() {
  const { messages, sendMessage, addToolApprovalResponse, status, error } = useChat({ transport: new DefaultChatTransport({ api: "/api/agent" }), messages: [welcome] });
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
  function chooseFlight(option: Flight) { setFlight(option); setActionStatus(`${option.airline} selected for your journey.`); }
  function completeApproval(approval: Approval) { addToolApprovalResponse({ id: approval.approvalId, approved: true }); setActionStatus("Approved. ClearSend is completing the sandbox action..."); }

  return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-symbol">↗</span><span>ClearSend <em>Journey</em></span></div><div className="topbar-meta"><span className="live-dot" />Agent online <span className="divider" />PayPal sandbox</div></header><div className="journey-layout"><section className="chat-column"><div className="chat-heading"><div><div className="eyebrow">Personal journey agent</div><h1>Move with clarity.</h1><p>Remittances, flights, and the details in between.</p></div><span className="secure-badge">⌁ Secure by design</span></div><div className="conversation" aria-live="polite">{messages.map((message) => <Message key={message.id} message={message} onApproval={completeApproval} onFlight={chooseFlight} />)}{busy && <div className="thinking"><span /><span /><span />ClearSend is thinking</div>}{error && <div className="error-state">{error.message || "The agent is temporarily unavailable."}</div>}</div><div className="composer-wrap"><div className="quick-starts">{quickStarts.map((start) => <button className="quick-chip" key={start} onClick={() => setInput(start)}>{start}<span>+</span></button>)}</div><form className="composer" onSubmit={submit}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder="Describe your journey..." aria-label="Describe your journey" /><button className="send-button" disabled={busy || !input.trim()} aria-label="Send message">↑</button></form><div className="composer-note"><span>Press Enter to send</span><span>PayPal actions always ask first</span></div></div></section><aside className="side-column"><JourneySummary remittance={remittance} flight={flight} status={actionStatus} /><div className="trust-note"><span>✦</span><div><strong>Transparent by default</strong><p>We show the fee and exchange rate before you decide.</p></div></div></aside></div></main>;
}
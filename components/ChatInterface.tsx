"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoice, VOICE_LANGUAGES } from "./useVoice";
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
  const [attachments, setAttachments] = useState<Array<{ name: string; text: string; note?: string; chars: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [speakReplies, setSpeakReplies] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const spokenId = useRef<string | undefined>(undefined);
  const onDictated = useCallback((text: string) => setInput((prev) => (prev ? prev + " " : "") + text), []);
  const voice = useVoice(onDictated);

  useEffect(() => {
    if (!speakReplies || status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || spokenId.current === last.id) return;
    spokenId.current = last.id;
    const text = (last.parts as Array<{ type?: string; text?: string }>).filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ").replace(/[*_#`>]/g, "");
    voice.speak(text);
  }, [messages, status, speakReplies, voice]);

  async function attach(file: File) {
    setUploading(true); setUploadError(undefined);
    try {
      const form = new FormData(); form.set("file", file);
      const res = await fetch("/api/documents/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read file");
      setAttachments((prev) => [...prev, { name: data.name, text: data.text, note: data.note, chars: data.text.length }].slice(0, 3));
    } catch (err) { setUploadError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  function withAttachments(text: string) {
    if (!attachments.length) return text;
    const blocks = attachments.map((a) => `[Attached document: ${a.name}]\n<untrusted_document name="${a.name.replace(/"/g, "'")}">\n${(a.text || `(no readable text: ${a.note ?? "empty"})`).replace(/<\/?untrusted_document[^>]*>/gi, "")}\n</untrusted_document>`);
    return `${text || "Please read the attached document."}\n\n${blocks.join("\n\n")}`;
  }

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

  async function submit(event: React.FormEvent) { event.preventDefault(); const text = input.trim(); if ((!text && !attachments.length) || busy) return; if (voice.listening) voice.stop(); setInput(""); setActionStatus(undefined); const full = withAttachments(text); setAttachments([]); await sendMessage({ text: full }); }
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

  return <main className="app-shell"><header className="topbar"><div className="brand"><ClearSendLogo compact /><span className="brand-wordmark">ClearSend</span></div><div className="topbar-meta"><span className="live-dot" />Agent online <span className="divider" />PayPal sandbox</div></header><div className="journey-layout"><section className="chat-column"><div className="chat-heading"><div><div className="eyebrow">Personal journey agent</div><h1>Move with clarity.</h1><p>Transparent cross-border money and travel, in one calm conversation.</p></div><span className="secure-badge">⌁ Secure by design</span></div><div className="conversation" aria-live="polite">{messages.length === 0 && <div className="empty-state"><ClearSendLogo /><h2>What journey can ClearSend clarify?</h2><p>Share the people, places, amounts, or plans on your mind. ClearSend will find the next best step.</p><div className="suggestions">{suggestions.map((suggestion) => <button className="suggestion-chip" key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}<span>→</span></button>)}</div></div>}{messages.map((message) => <Message key={message.id} message={message} onApproval={approve} onFlight={chooseFlight} onQuickReply={quickReply} />)}{busy && <div className="thinking"><ClearSendLogo compact /><span>ClearSend is thinking</span><i /><i /><i /></div>}{error && <div className="error-state"><ClearSendLogo compact />{error.message || "ClearSend is temporarily unavailable."}</div>}</div><div className="composer-wrap"><div className="voice-bar"><label className="voice-lang">🌐 <select value={voice.lang} onChange={(e) => voice.setLang(e.target.value)} aria-label="Voice language">{VOICE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label><label className="voice-toggle"><input type="checkbox" checked={speakReplies} onChange={(e) => { setSpeakReplies(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }} disabled={!voice.supported.tts} /> 🔊 Speak replies</label>{voice.speaking && <button type="button" className="voice-stop" onClick={voice.stopSpeaking}>■ Stop speaking</button>}{!voice.supported.stt && <span className="voice-unsupported">Voice input isn&apos;t available in this browser. Typing works everywhere.</span>}</div>{(voice.listening || voice.interim) && <div className="live-transcript" aria-live="polite"><span className="rec-dot" />{voice.interim || "Listening…"}</div>}{voice.error && <div className="voice-error" role="alert">{voice.error}</div>}{(attachments.length > 0 || uploading || uploadError) && <div className="file-chips">{attachments.map((a, i) => <span key={i} className="file-chip" title={a.note ?? `${a.chars} characters extracted`}>📎 {a.name} <em>{a.note ? "no text" : `${Math.ceil(a.chars / 100) / 10}k chars`}</em><button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}>×</button></span>)}{uploading && <span className="file-chip">Reading document…</span>}{uploadError && <span className="voice-error">{uploadError}</span>}</div>}<form className="composer" onSubmit={submit}><input ref={fileInput} type="file" hidden accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} /><button type="button" className="tool-button" onClick={() => fileInput.current?.click()} disabled={uploading || attachments.length >= 3} aria-label="Attach document" title="Attach PDF, DOCX, TXT or image (5 MB max)">📎</button><button type="button" className={`tool-button mic${voice.listening ? " on" : ""}`} onPointerDown={(e) => { e.preventDefault(); voice.start(); }} onPointerUp={() => voice.stop()} onPointerLeave={() => voice.listening && voice.stop()} onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !voice.listening) { e.preventDefault(); voice.start(); } }} onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") voice.stop(); }} aria-label="Hold to talk" aria-pressed={voice.listening} title={voice.supported.stt ? "Hold to talk" : "Voice input not supported in this browser"}>🎙</button><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder="Tell ClearSend what you need..." aria-label="Tell ClearSend what you need" /><button className="send-button" disabled={busy || (!input.trim() && !attachments.length)} aria-label="Send message">↑</button></form><div className="composer-note"><span>Enter to send · hold 🎙 to talk · 📎 attach docs</span><span>PayPal actions always ask first</span></div></div></section><aside className="side-column"><JourneySummary remittance={remittance} flight={flight} status={actionStatus} /><PayPalActivityPanel activities={paypalActivities} /><div className="trust-note"><ClearSendLogo compact /><div><strong>Clear by design</strong><p>Fees, rates, routes, and approvals stay visible at every step.</p></div></div></aside></div></main>;
}
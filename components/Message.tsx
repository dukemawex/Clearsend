import type { UIMessage } from "ai";
import { ApprovalBar } from "./ApprovalBar";
import { FlightCard } from "./FlightCard";
import { RemittanceCard } from "./RemittanceCard";
import { EscrowCard } from "./EscrowCard";
import type { Approval, Flight, Remittance } from "./journey-types";
import type { EscrowRecord } from "@/lib/escrow";

type Part = { type?: string; text?: string; output?: unknown; state?: string; toolCallId?: string; input?: Record<string, unknown>; approval?: { id?: string } };

function sanitizeText(text: string): string {
  // Strip any tool-call-like JSON objects from assistant text
  const toolCallPattern = /\{[\s\n]*["']?(name|type|function)["']?\s*:\s*["'][^"']+["'][^}]*\}/gi;
  return text.replace(toolCallPattern, "").trim();
}

export function Message({ message, onApproval, onFlight, onQuickReply }: { message: UIMessage; onApproval: (approval: Approval) => void; onFlight: (flight: Flight) => void; onQuickReply?: (text: string) => void }) {
  const parts = message.parts as Part[];
  let hasFlights = false;
  
  const renderedParts = parts.map((part, index) => {
    if (part.type === "text") {
      const cleanedText = message.role === "assistant" ? sanitizeText(part.text || "") : (part.text || "");
      if (!cleanedText) return null;
      return <p key={index}>{cleanedText}</p>;
    }
    if (!part.type?.startsWith("tool-")) return null;
    const toolName = part.type.replace("tool-", "");
    const output = part.output as Record<string, unknown> | undefined;
    if (toolName === "calculateRemittance" && output?.amountSent) return <RemittanceCard key={index} data={output as unknown as Remittance} />;
    if (toolName === "searchFlights" && Array.isArray(output?.options) && (output.options as Flight[]).length > 0) {
      hasFlights = true;
      return <FlightCard key={index} flights={output.options as Flight[]} onSelect={onFlight} />;
    }
    if ((toolName === "createEscrow" || toolName === "getEscrow") && output?.id && output?.state) return <EscrowCard key={index} escrow={output as unknown as EscrowRecord} />;
    if (toolName === "listEscrows" && Array.isArray(output)) return <div key={index} className="space-y-2">{(output as EscrowRecord[]).map((escrow) => <EscrowCard key={escrow.id} escrow={escrow} />)}</div>;
    if (part.state === "approval-requested" && part.input && part.approval?.id) return <ApprovalBar key={index} approval={{ approvalId: part.approval.id, toolName, toolCallId: part.toolCallId ?? "", input: part.input }} onApprove={onApproval} />;
    return null;
  });
  
  return <article className={`message ${message.role}`}>
    <div className="message-label">{message.role === "assistant" ? "CLEAR / AGENT" : "YOU"}</div>
    {renderedParts}
    {hasFlights && onQuickReply && message.role === "assistant" && (
      <div className="quick-replies" style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <button className="suggestion-chip" onClick={() => onQuickReply("Book the cheapest flight with PayPal")}>Book with PayPal</button>
        <button className="suggestion-chip" onClick={() => onQuickReply("Show me different flights")}>Change flight</button>
      </div>
    )}
  </article>;
}

import type { UIMessage } from "ai";
import { ApprovalBar } from "./ApprovalBar";
import { FlightCard } from "./FlightCard";
import { RemittanceCard } from "./RemittanceCard";
import type { Approval, Flight, Remittance } from "./journey-types";

type Part = { type?: string; text?: string; output?: unknown; state?: string; toolCallId?: string; input?: Record<string, unknown>; approval?: { id?: string } };

export function Message({ message, onApproval, onFlight }: { message: UIMessage; onApproval: (approval: Approval) => void; onFlight: (flight: Flight) => void }) {
  const parts = message.parts as Part[];
  return <article className={`message ${message.role}`}><div className="message-label">{message.role === "assistant" ? "CLEAR / AGENT" : "YOU"}</div>{parts.map((part, index) => {
    if (part.type === "text") return <p key={index}>{part.text}</p>;
    if (!part.type?.startsWith("tool-")) return null;
    const toolName = part.type.replace("tool-", "");
    const output = part.output as Record<string, unknown> | undefined;
    if (toolName === "calculateRemittance" && output?.amountSent) return <RemittanceCard key={index} data={output as unknown as Remittance} />;
    if (toolName === "searchFlights" && Array.isArray(output?.options)) return <FlightCard key={index} flights={output.options as Flight[]} onSelect={onFlight} />;
    if (part.state === "approval-requested" && part.input && part.approval?.id) return <ApprovalBar key={index} approval={{ approvalId: part.approval.id, toolName, toolCallId: part.toolCallId ?? "", input: part.input }} onApprove={onApproval} />;
    return null;
  })}</article>;
}
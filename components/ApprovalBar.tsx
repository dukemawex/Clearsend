import type { Approval } from "./journey-types";
import { Button } from "./ui/button";

export function ApprovalBar({ approval, onApprove }: { approval: Approval; onApprove: (approval: Approval) => void }) {
  const isPayout = approval.toolName === "createPayout";
  return <div className="approval-bar"><div><span className="card-kicker">Approval required</span><strong>{isPayout ? "Send this remittance?" : "Pay for this flight?"}</strong><small>Nothing moves until you approve this PayPal sandbox action.</small></div><Button className="approve" onClick={() => onApprove(approval)}>Approve action</Button></div>;
}
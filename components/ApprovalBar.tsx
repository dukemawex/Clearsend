import { useState } from "react";
import type { Approval } from "./journey-types";
import { ClearSendLogo } from "./clearsend-logo";
import { Button } from "./ui/button";

export function ApprovalBar({ approval, onApprove }: { approval: Approval; onApprove: (approval: Approval) => void }) {
  const [approved, setApproved] = useState(false);
  const isPayout = approval.toolName === "createPayout";
  if (approved) return <div className="approval-bar approval-success"><ClearSendLogo compact /><div><strong>ClearSend is completing this sandbox action</strong><small>PayPal is confirming the approved {isPayout ? "payout" : "flight order"}.</small></div></div>;
  return <div className="approval-bar"><div><span className="card-kicker">Approval required</span><strong>{isPayout ? "Send this remittance?" : "Pay for this flight?"}</strong><small>Nothing moves until you approve this PayPal sandbox action.</small></div><Button className="approve" onClick={() => { setApproved(true); onApprove(approval); }}>Approve action</Button></div>;
}
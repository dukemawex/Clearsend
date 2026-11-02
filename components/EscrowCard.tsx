"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EscrowRecord } from "@/lib/escrow";

type EscrowCardProps = {
  escrow: EscrowRecord;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStateBadgeColor(state: EscrowRecord["state"]): string {
  switch (state) {
    case "created":
      return "bg-gray-500";
    case "funded":
      return "bg-blue-500";
    case "submitted":
      return "bg-yellow-500";
    case "verified":
      return "bg-green-500";
    case "rejected":
      return "bg-red-500";
    case "released":
      return "bg-emerald-600";
    case "refunded":
      return "bg-orange-500";
    default:
      return "bg-gray-400";
  }
}

export function EscrowCard({ escrow }: EscrowCardProps) {
  return (
    <Card className="border-gray-200 bg-white">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base font-medium">
            Escrow {escrow.id.slice(-8)}
          </CardTitle>
          <Badge className={`${getStateBadgeColor(escrow.state)} text-white`}>
            {escrow.state}
          </Badge>
        </div>
        <CardDescription className="text-sm">
          {escrow.amount.toFixed(2)} {escrow.currency} • {escrow.payer} → {escrow.recipient}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-gray-900">Specification</p>
          <p className="text-gray-600">{escrow.specification}</p>
        </div>
        
        {escrow.acceptanceCriteria && escrow.acceptanceCriteria.length > 0 && (
          <div>
            <p className="font-medium text-gray-900">Acceptance Criteria</p>
            <ul className="list-inside list-disc space-y-1 text-gray-600">
              {escrow.acceptanceCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}
        
        {escrow.deliverable && (
          <div>
            <p className="font-medium text-gray-900">Deliverable</p>
            <p className="text-gray-600">{escrow.deliverable}</p>
          </div>
        )}
        
        {escrow.evaluationResult && (
          <div>
            <p className="font-medium text-gray-900">Evaluation</p>
            <p className={`${escrow.evaluationResult.met ? "text-green-600" : "text-red-600"}`}>
              {escrow.evaluationResult.met ? "✓ Approved" : "✗ Rejected"}
            </p>
            <p className="text-gray-600">{escrow.evaluationResult.reasons}</p>
            {escrow.evaluationResult.criteriaResults && (
              <ul className="mt-1 space-y-1 text-xs">
                {escrow.evaluationResult.criteriaResults.map((cr, i) => (
                  <li key={i} className={cr.met ? "text-green-600" : "text-red-600"}>
                    {cr.met ? "✓" : "✗"} {cr.criterion}: {cr.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        
        <div>
          <p className="font-medium text-gray-900">Timeline</p>
          <div className="space-y-1 text-xs text-gray-600">
            {escrow.timeline.map((event, i) => (
              <div key={i} className="flex justify-between">
                <span className="capitalize">{event.state}</span>
                <span>{formatDate(event.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
        
        {escrow.orderId && (
          <div className="text-xs text-gray-500">
            <p>Order ID: {escrow.orderId}</p>
          </div>
        )}
        
        {escrow.payoutBatchId && (
          <div className="text-xs text-gray-500">
            <p>Payout Batch: {escrow.payoutBatchId}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

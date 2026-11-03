"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EscrowRecord } from "@/lib/escrow";
import type { EscrowRole } from "@/lib/escrow-links";
import { EscrowDocuments } from "@/components/EscrowDocuments";
import { Stepper } from "@/components/room/Stepper";
import { escrowStep } from "@/lib/workflow";
import { SandboxHelp } from "@/components/SandboxHelp";
import { SpecView } from "@/components/SpecReview";

export default function EscrowPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const role = (searchParams.get("role") || "payer") as EscrowRole;
  const token = searchParams.get("token");

  const [escrow, setEscrow] = useState<EscrowRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliverable, setDeliverable] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);

  useEffect(() => {
    loadEscrow();
  }, [id]);

  const loadEscrow = async () => {
    try {
      const url = token 
        ? `/api/escrow/${id}?role=${role}&token=${token}`
        : `/api/escrow/${id}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load escrow");
      const data = await res.json();
      setEscrow(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  const handleSubmitDeliverable = async () => {
    if (!deliverable.trim()) {
      alert("Please enter deliverable details");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/escrow/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrowId: id, deliverable, role, token }),
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to submit deliverable");
      
      await loadEscrow();
      setDeliverable("");
      alert("Deliverable submitted successfully!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit deliverable");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/escrow/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrowId: id, role, token }),
      });

      if (!res.ok) throw new Error("Failed to verify deliverable");
      
      await loadEscrow();
      alert("Deliverable verified!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to verify deliverable");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRelease = async () => {
    const typedRelease = prompt(`Type the exact amount to release (${escrow?.amount.toFixed(2)} ${escrow?.currency}) to pay ${escrow?.recipient} via PayPal Payout. This cannot be undone.`);
    if (!escrow || typedRelease?.trim() !== `${escrow.amount.toFixed(2)} ${escrow.currency}`) {
      if (typedRelease !== null) alert("That did not match. Nothing was released.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/escrow/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrowId: id, role, token }),
      });

      if (!res.ok) throw new Error("Failed to release funds");
      
      await loadEscrow();
      alert("Funds released successfully!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to release funds");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFund = async () => {
    if (!escrow) return;
    const want = `${escrow.amount.toFixed(2)} ${escrow.currency}`;
    const typed = prompt(`Type ${want} to create a PayPal sandbox order and fund this escrow.`);
    if (typed?.trim() !== want) { if (typed !== null) alert("That did not match. No order was created."); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/escrow/fund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escrowId: id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.approveUrl) throw new Error(j.error || "PayPal returned no approval link");
      setApproveUrl(j.approveUrl);
      setIsSubmitting(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start PayPal funding");
      setIsSubmitting(false);
    }
  };

  const handleRefund = async () => {
    const typedRefund = prompt(`Type REFUND to return ${escrow?.amount.toFixed(2)} ${escrow?.currency} to the payer via PayPal. This cannot be undone.`);
    if (typedRefund?.trim() !== "REFUND") {
      if (typedRefund !== null) alert("That did not match. Nothing was refunded.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/escrow/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrowId: id, role, token }),
      });

      if (!res.ok) throw new Error("Failed to refund escrow");
      
      await loadEscrow();
      alert("Escrow refunded successfully!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to refund escrow");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading escrow...</p>
      </div>
    );
  }

  if (error || !escrow) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-red-600">Error: {error || "Escrow not found"}</p>
      </div>
    );
  }

  const getStateBadgeColor = (state: EscrowRecord["state"]) => {
    switch (state) {
      case "created": return "bg-gray-500";
      case "funded": return "bg-blue-500";
      case "submitted": return "bg-yellow-500";
      case "verified": return "bg-green-500";
      case "rejected": return "bg-red-500";
      case "released": return "bg-emerald-600";
      case "refunded": return "bg-orange-500";
      default: return "bg-gray-400";
    }
  };

  const getNextAction = () => {
    switch (escrow.state) {
      case "created":
        return "Waiting for payer to fund this escrow";
      case "funded":
        return role === "recipient" ? "Submit your deliverable" : "Waiting for recipient to submit deliverable";
      case "submitted":
        return role === "verifier" ? "Verify the deliverable" : "Waiting for AI verification";
      case "verified":
        return role === "payer" ? "Review and approve release" : "Waiting for payer approval";
      case "released":
        return "Funds have been released to recipient";
      case "refunded":
        return "Escrow has been refunded to payer";
      case "rejected":
        return role === "payer" ? "Deliverable rejected - refund available" : "Deliverable was rejected";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6"><Stepper current={escrowStep(escrow.state)} skip={[0, 1, 2]} compact /></div>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Escrow {escrow.id.slice(-8)}</h1>
              <p className="text-gray-600">
                Viewing as: <span className="font-medium capitalize">{role}</span>
              </p>
            </div>
            <Badge className={`${getStateBadgeColor(escrow.state)} text-white text-lg px-4 py-2`}>
              {escrow.state}
            </Badge>
          </div>

          {/* Amount Display */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="text-center">
              <p className="text-gray-600 mb-2">Escrow Amount</p>
              <p className="text-4xl font-bold">
                {escrow.amount.toFixed(2)} {escrow.currency}
              </p>
              <p className="text-gray-600 mt-2">
                {escrow.payer} → {escrow.recipient}
              </p>
            </div>
          </div>
        </div>

        {/* How This Works */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>How This Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-gray-700">
              ClearSend Escrow protects both parties in a transaction. Here&apos;s how:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-gray-600">
              <li><strong>Payer funds the escrow</strong> - Money is held securely in PayPal</li>
              <li><strong>Recipient submits deliverable</strong> - Proof of work or delivery</li>
              <li><strong>AI verifies against spec</strong> - Automated check of acceptance criteria</li>
              <li><strong>Payer approves release</strong> - Final human approval required</li>
              <li><strong>Funds are released</strong> - PayPal payout sent to recipient</li>
            </ol>
            <div className="bg-blue-50 p-3 rounded-md mt-4">
              <p className="text-sm text-blue-900">
                🔒 <strong>Your money is safe:</strong> {" "}
                {role === "payer" && "Funds stay in escrow until you approve release. You can dispute or refund if deliverable doesn't meet spec."}
                {role === "recipient" && "Once you submit deliverable and it's verified, payer has 48 hours to approve. If they don't respond, you can request release."}
                {role === "verifier" && "AI evaluation is advisory only. Payer has final approval."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Status Timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Status & Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md">
                <p className="text-sm font-medium text-yellow-900">
                  ⏳ {getNextAction()}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {escrow.timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1 ${i === escrow.timeline.length - 1 ? "bg-blue-600" : "bg-gray-300"}`} />
                  <div className="flex-1">
                    <p className="font-medium capitalize">{event.state.replace(/_/g, " ")}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                    {event.note && (
                      <p className="text-sm text-gray-600 mt-1">{event.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Specification */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Specification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {escrow.structuredSpec && <SpecView spec={escrow.structuredSpec} />}
            <div>
              {escrow.structuredSpec && <p className="font-medium text-gray-900 mb-1">Specification text</p>}
              <p className="text-gray-700 whitespace-pre-wrap">{escrow.specification}</p>
            </div>

            {escrow.acceptanceCriteria && escrow.acceptanceCriteria.length > 0 && (
              <div>
                <p className="font-medium text-gray-900 mb-2">Acceptance Criteria:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  {escrow.acceptanceCriteria.map((criterion, i) => (
                    <li key={i}>{criterion}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <EscrowDocuments escrow={escrow} role={role} token={token} onChange={loadEscrow} />

        {/* Receipts (only real PayPal sandbox events) */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(escrow.receipts ?? []).length === 0 ? (
              <p className="text-gray-600">No receipts yet. One is issued automatically after the PayPal sandbox capture, payout or refund.</p>
            ) : (escrow.receipts ?? []).map((r) => (
              <a key={r.id} href={`/receipt/${r.id}?role=${role}&token=${token ?? ""}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-blue-50">
                <span><b className="capitalize">{r.kind}</b> <span className="font-mono text-gray-500">{r.number}</span></span>
                <span className="font-semibold">{r.amount.toFixed(2)} {r.currency} · {r.status}</span>
              </a>
            ))}
            {token && <a className="inline-block pt-1 font-semibold text-blue-700 underline" href={`/receipts?escrow=${id}&role=${role}&token=${token}`}>All receipts for this escrow</a>}
          </CardContent>
        </Card>

        {/* Deliverable Submission (for recipient) */}
        {role === "recipient" && escrow.state === "funded" && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Submit Deliverable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="deliverable" className="block text-sm font-medium mb-2">
                  Deliverable Details (text, URL, or description)
                </label>
                <textarea
                  id="deliverable"
                  value={deliverable}
                  onChange={(e) => setDeliverable(e.target.value)}
                  className="w-full p-3 border rounded-md min-h-[120px]"
                  placeholder="Provide details, links, or proof of delivery..."
                />
              </div>
              <Button 
                onClick={handleSubmitDeliverable} 
                disabled={isSubmitting || (!deliverable.trim() && !(escrow.documents ?? []).some((d) => d.role === "deliverable"))}
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : "Submit Deliverable"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Deliverable Display */}
        {escrow.deliverable && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Deliverable Submitted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-md">
                <p className="text-gray-700 whitespace-pre-wrap">{escrow.deliverable}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Verification Result */}
        {escrow.evaluationResult && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>AI Verification Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded-md ${escrow.evaluationResult.met ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <p className={`font-medium ${escrow.evaluationResult.met ? "text-green-900" : "text-red-900"}`}>
                  {escrow.evaluationResult.met ? "✓ Deliverable Approved" : "✗ Deliverable Rejected"}
                </p>
                <p className={`text-sm mt-2 ${escrow.evaluationResult.met ? "text-green-800" : "text-red-800"}`}>
                  {escrow.evaluationResult.reasons}
                </p>
              </div>

              {escrow.evaluationResult.criteriaResults && (
                <div>
                  <p className="font-medium mb-2">Per-Criterion Results:</p>
                  <ul className="space-y-2">
                    {escrow.evaluationResult.criteriaResults.map((cr, i) => (
                      <li key={i} className={`text-sm ${cr.met ? "text-green-700" : "text-red-700"}`}>
                        {cr.met ? "✓" : "✗"} <strong>{cr.criterion}:</strong> {cr.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {role === "verifier" && escrow.state === "submitted" && (
              <Button 
                onClick={handleVerify} 
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? "Verifying..." : "Run AI Verification"}
              </Button>
            )}

            {role === "payer" && escrow.state === "created" && (
              <div className="space-y-3">
                <SandboxHelp />
                {approveUrl ? (
                  <a href={approveUrl} className="block w-full rounded-md bg-[#ffc439] px-4 py-2 text-center font-bold text-[#003087]">Continue to PayPal sandbox checkout</a>
                ) : (
                  <Button onClick={handleFund} disabled={isSubmitting} className="w-full">
                    Fund {escrow.amount.toFixed(2)} {escrow.currency} with PayPal (sandbox)
                  </Button>
                )}
              </div>
            )}
            {role === "payer" && escrow.state === "verified" && (
              <Button 
                onClick={handleRelease} 
                disabled={isSubmitting}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? "Releasing..." : "Approve & Release Funds"}
              </Button>
            )}

            {role === "payer" && ["funded", "submitted", "rejected"].includes(escrow.state) && (
              <Button 
                onClick={handleRefund} 
                disabled={isSubmitting}
                variant="danger"
                className="w-full"
              >
                {isSubmitting ? "Processing..." : "Cancel & Refund"}
              </Button>
            )}

            {escrow.orderId && (
              <div className="pt-4 border-t space-y-2 text-sm text-gray-600">
                <p><strong>PayPal Order ID:</strong> {escrow.orderId}</p>
                {escrow.captureId && <p><strong>Capture ID:</strong> {escrow.captureId}</p>}
                {escrow.payoutBatchId && <p><strong>Payout Batch ID:</strong> {escrow.payoutBatchId}</p>}
                {escrow.refundId && <p><strong>Refund ID:</strong> {escrow.refundId}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

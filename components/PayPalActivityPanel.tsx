"use client";

import { useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

export type PayPalActivity = {
  id: string;
  timestamp: number;
  toolName: string;
  args: Record<string, unknown>;
  paypalId?: string;
  status: "pending" | "approved" | "success" | "failed";
  latencyMs?: number;
  error?: string;
};

export function PayPalActivityPanel({ activities }: { activities: PayPalActivity[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (activities.length === 0) return null;

  const sanitizeArgs = (args: Record<string, unknown>) => {
    const sanitized = { ...args };
    // Redact sensitive fields
    if (sanitized.recipientEmail) sanitized.recipientEmail = sanitized.recipientEmail.toString().replace(/(.{3}).*(@.*)/, "$1***$2");
    if (sanitized.clientId) sanitized.clientId = "***";
    if (sanitized.clientSecret) sanitized.clientSecret = "***";
    return sanitized;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success": return "bg-green-100 text-green-800";
      case "failed": return "bg-red-100 text-red-800";
      case "approved": return "bg-blue-100 text-blue-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getToolIcon = (toolName: string) => {
    if (toolName.includes("payout") || toolName.includes("Payout")) return "💸";
    if (toolName.includes("order") || toolName.includes("Order")) return "🛒";
    if (toolName.includes("invoice") || toolName.includes("Invoice")) return "📄";
    if (toolName.includes("product") || toolName.includes("Product")) return "📦";
    if (toolName.includes("dispute") || toolName.includes("Dispute")) return "⚖️";
    if (toolName.includes("refund") || toolName.includes("Refund")) return "↩️";
    return "🔧";
  };

  return (
    <Card className="paypal-activity-panel">
      <div 
        className="panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: "pointer", padding: "16px", borderBottom: isExpanded ? "1px solid #e5e7eb" : "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              PayPal Agent Activity
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: "4px 0 0 0" }}>
              {activities.length} tool call{activities.length !== 1 ? "s" : ""} tracked
            </p>
          </div>
          <Badge className={getStatusColor(activities[activities.length - 1]?.status || "pending")}>
            {activities[activities.length - 1]?.status || "pending"}
          </Badge>
        </div>
      </div>

      {isExpanded && (
        <div className="activity-timeline" style={{ padding: "16px" }}>
          {activities.map((activity, index) => (
            <div 
              key={activity.id} 
              className="activity-item"
              style={{
                display: "flex",
                gap: "12px",
                paddingBottom: "16px",
                marginBottom: index < activities.length - 1 ? "16px" : 0,
                borderBottom: index < activities.length - 1 ? "1px solid #f3f4f6" : "none"
              }}
            >
              <div style={{ fontSize: "24px", flexShrink: 0 }}>
                {getToolIcon(activity.toolName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                  <div>
                    <strong style={{ fontSize: "14px", fontWeight: 600 }}>
                      {activity.toolName}
                    </strong>
                    {activity.paypalId && (
                      <code style={{ 
                        fontSize: "12px", 
                        color: "#6b7280", 
                        marginLeft: "8px",
                        padding: "2px 6px",
                        background: "#f3f4f6",
                        borderRadius: "4px"
                      }}>
                        {activity.paypalId}
                      </code>
                    )}
                  </div>
                  <Badge className={getStatusColor(activity.status)}>
                    {activity.status}
                  </Badge>
                </div>

                <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>
                  {new Date(activity.timestamp).toLocaleTimeString()}
                  {activity.latencyMs && ` • ${activity.latencyMs}ms`}
                </div>

                <details style={{ fontSize: "13px" }}>
                  <summary style={{ cursor: "pointer", color: "#3b82f6", fontWeight: 500 }}>
                    View arguments
                  </summary>
                  <pre style={{ 
                    marginTop: "8px", 
                    padding: "8px", 
                    background: "#f9fafb", 
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto",
                    maxHeight: "200px"
                  }}>
                    {JSON.stringify(sanitizeArgs(activity.args), null, 2)}
                  </pre>
                </details>

                {activity.error && (
                  <div style={{ 
                    marginTop: "8px", 
                    padding: "8px", 
                    background: "#fef2f2", 
                    borderRadius: "4px",
                    fontSize: "13px",
                    color: "#991b1b"
                  }}>
                    Error: {activity.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

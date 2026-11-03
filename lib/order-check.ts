/** Pure check that a PayPal order (GET /v2/checkout/orders/:id) was created for this escrow. Returns a reason, or null if it matches. */
export function checkOrderMatchesEscrow(order: unknown, escrow: { id: string; amount: number; currency: string }): string | null {
  const o = order as { intent?: string; status?: string; purchase_units?: Array<{ custom_id?: string; reference_id?: string; amount?: { value?: string; currency_code?: string } }> } | null;
  const units = o?.purchase_units ?? [];
  if (units.length !== 1) return "expected exactly one purchase unit";
  const u = units[0];
  if (u.custom_id !== `escrow:${escrow.id}`) return "it was not created for this escrow";
  if (u.amount?.currency_code?.toUpperCase() !== escrow.currency.toUpperCase()) return `currency ${u.amount?.currency_code ?? "?"} does not match ${escrow.currency}`;
  if (u.amount?.value !== escrow.amount.toFixed(2)) return `amount ${u.amount?.value ?? "?"} does not match ${escrow.amount.toFixed(2)}`;
  if (o?.intent && o.intent !== "CAPTURE") return "order intent is not CAPTURE";
  if (o?.status && !["APPROVED", "COMPLETED"].includes(o.status)) return o.status === "CREATED" || o.status === "PAYER_ACTION_REQUIRED" ? "the buyer has not approved it in PayPal yet" : `order status is ${o.status}`;
  return null;
}

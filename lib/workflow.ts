// The one workflow everyone follows, shared by the Room home, /plan, role views and /judges.
export const WORKFLOW = [
  { key: "search", label: "Search flights", hint: "Sky-Scrapper, Duffel, open data" },
  { key: "choose", label: "Choose", hint: "Agent asks which flight" },
  { key: "confirm", label: "Confirm", hint: "Traveller + typed yes" },
  { key: "pay", label: "Pay with PayPal", hint: "Sandbox approve + capture" },
  { key: "funded", label: "Escrow funded", hint: "Held after PayPal capture" },
  { key: "submitted", label: "Deliverable submitted", hint: "Recipient posts work" },
  { key: "verified", label: "AI verified", hint: "Free model, per criterion" },
  { key: "release", label: "Human release", hint: "Payer types the amount" },
  { key: "paid-out", label: "Paid out", hint: "PayPal Payout, any country" },
] as const;

/** Index of the step a trip is waiting on. 9 = done. */
export function tripStep(state: string): number {
  return ({ draft: 2, passenger_details_pending: 2, payment_pending: 3, payment_approved: 9, ticketing: 9, confirmed: 9, failed: 9, refunded: 9 } as Record<string, number>)[state] ?? 2;
}
/** Index of the step an escrow is waiting on. Escrows skip search/choose. 9 = done. */
export function escrowStep(state: string): number {
  return ({ created: 3, funded: 5, submitted: 6, verified: 7, rejected: 7, released: 9, refunded: 9 } as Record<string, number>)[state] ?? 3;
}

export const STATE_TONE: Record<string, "ok" | "warn" | "bad" | "acc" | "mut"> = {
  created: "acc", draft: "acc", passenger_details_pending: "acc", payment_pending: "warn", payment_approved: "ok", ticketing: "warn", confirmed: "ok",
  funded: "acc", submitted: "warn", verified: "ok", released: "ok", rejected: "bad", refunded: "mut", failed: "bad",
};

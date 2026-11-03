const PAYPAL_SANDBOX = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(message: string, public readonly status = 502, public readonly details?: unknown) {
    super(message);
    this.name = "PayPalError";
  }
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new PayPalError("PayPal sandbox credentials are not configured.", 503);
  return { clientId, clientSecret };
}

async function paypalFetch(path: string, init: RequestInit = {}, accessToken?: string) {
  const response = await fetch(`${PAYPAL_SANDBOX}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...init.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new PayPalError(body.message ?? "PayPal request failed.", response.status, body);
  return body;
}

export async function getPayPalAccessToken() {
  const { clientId, clientSecret } = credentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PAYPAL_SANDBOX}/v1/oauth2/token`, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new PayPalError(body.error_description ?? "PayPal authentication failed.", response.status, body);
  return body.access_token as string;
}

export async function createPayout(input: { recipientEmail?: string; receiver?: string; recipientType?: "EMAIL" | "PHONE" | "PAYPAL_ID"; amount: number; currency: string; note?: string }) {
  const token = await getPayPalAccessToken();
  return paypalFetch("/v1/payments/payouts", { method: "POST", body: JSON.stringify({ sender_batch_header: { sender_batch_id: `clearsend-${Date.now()}`, email_subject: "You have a ClearSend payment", email_message: input.note ?? "A ClearSend remittance has arrived." }, items: [{ recipient_type: input.recipientType ?? "EMAIL", amount: { value: input.amount.toFixed(2), currency: input.currency }, receiver: input.receiver ?? input.recipientEmail, note: input.note }] }) }, token);
}

export async function getPayoutStatus(batchId: string) { return paypalFetch(`/v1/payments/payouts/${encodeURIComponent(batchId)}`, {}, await getPayPalAccessToken()); }

function appBase() {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !env.includes("localhost")) return env.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return env ?? "http://localhost:3000";
}

/** Return/cancel pages carry only the record kind and id, never a role or trip token. PayPal appends ?token=<orderId>&PayerID=.
 * Uses payment_source.paypal.experience_context (current Orders v2 API): landing_page GUEST_CHECKOUT asks PayPal to open the
 * card / guest form first where the buyer's country and the merchant account allow it; PayPal decides the final page.
 * Set PAYPAL_EXPERIENCE=legacy to fall back to application_context. */
export async function createOrder(input: { amount: number; currency?: string; description: string; returnTo?: { kind: "escrow" | "trip" | "order"; id?: string } }) {
  const q = new URLSearchParams({ kind: input.returnTo?.kind ?? "order", ...(input.returnTo?.id ? { id: input.returnTo.id } : {}) }).toString();
  const urls = { return_url: `${appBase()}/paypal/return?${q}`, cancel_url: `${appBase()}/paypal/cancel?${q}` };
  const unit = { description: input.description.slice(0, 127), amount: { currency_code: input.currency ?? "USD", value: input.amount.toFixed(2) } };
  const body = process.env.PAYPAL_EXPERIENCE === "legacy"
    ? { intent: "CAPTURE", purchase_units: [unit], application_context: { brand_name: "ClearSend", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", ...urls } }
    : { intent: "CAPTURE", purchase_units: [unit], payment_source: { paypal: { experience_context: { brand_name: "ClearSend", landing_page: "GUEST_CHECKOUT", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", payment_method_preference: "UNRESTRICTED", ...urls } } } };
  return paypalFetch("/v2/checkout/orders", { method: "POST", headers: { "PayPal-Request-Id": `cs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }, body: JSON.stringify(body) }, await getPayPalAccessToken());
}

/** Buyer approval URL: "payer-action" with payment_source, "approve" with legacy application_context. */
export function approveLink(order: { links?: Array<{ rel: string; href: string }> } | Record<string, unknown>): string | undefined {
  const links = (order as { links?: Array<{ rel: string; href: string }> }).links;
  return links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}

/** Turn a PayPal capture error into something the payer can act on. */
export function captureErrorMessage(error: unknown): string {
  const details = (error as PayPalError)?.details as { details?: Array<{ issue?: string }>; name?: string } | undefined;
  const issue = details?.details?.[0]?.issue ?? details?.name ?? "";
  switch (issue) {
    case "ORDER_NOT_APPROVED": return "PayPal says this order isn't approved yet. Open the PayPal link again, log in with the sandbox buyer (or pay by test card) and press Pay, then capture.";
    case "INSTRUMENT_DECLINED": return "The sandbox payment method was declined. Go back to PayPal and choose another funding source or test card, then capture again.";
    case "ORDER_ALREADY_CAPTURED": return "This order was already captured. Refresh the escrow page; it should show as funded.";
    case "PAYER_ACTION_REQUIRED": return "PayPal needs the buyer to finish an extra step. Open the PayPal link again and complete it.";
    case "RESOURCE_NOT_FOUND": case "INVALID_RESOURCE_ID": return "PayPal can't find this order (it may have expired after 3 hours). Start funding again to get a fresh order.";
    default: return error instanceof Error ? `PayPal capture failed: ${error.message}. You can retry, or start funding again for a fresh order.` : "PayPal capture failed. Retry, or start funding again.";
  }
}

export async function captureOrder(orderId: string) { return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: "{}" }, await getPayPalAccessToken()); }

export async function getOrder(orderId: string) { return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {}, await getPayPalAccessToken()); }

export async function refundCapture(captureId: string, amount?: { value: string; currency: string }, note?: string) {
  const token = await getPayPalAccessToken();
  const body = amount ? JSON.stringify({ amount, note_to_payer: note }) : JSON.stringify({ note_to_payer: note });
  return paypalFetch(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", body }, token);
}
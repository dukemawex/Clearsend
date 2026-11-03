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

export async function createPayout(input: { recipientEmail: string; amount: number; currency: string; note?: string }) {
  const token = await getPayPalAccessToken();
  return paypalFetch("/v1/payments/payouts", { method: "POST", body: JSON.stringify({ sender_batch_header: { sender_batch_id: `clearsend-${Date.now()}`, email_subject: "You have a ClearSend payment", email_message: input.note ?? "A ClearSend remittance has arrived." }, items: [{ recipient_type: "EMAIL", amount: { value: input.amount.toFixed(2), currency: input.currency }, receiver: input.recipientEmail, note: input.note }] }) }, token);
}

export async function getPayoutStatus(batchId: string) { return paypalFetch(`/v1/payments/payouts/${encodeURIComponent(batchId)}`, {}, await getPayPalAccessToken()); }

function appBase() {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !env.includes("localhost")) return env.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return env ?? "http://localhost:3000";
}

/** Return/cancel pages carry only the record kind and id, never a role or trip token. PayPal appends ?token=<orderId>&PayerID=. */
export async function createOrder(input: { amount: number; currency?: string; description: string; returnTo?: { kind: "escrow" | "trip" | "order"; id?: string } }) {
  const q = new URLSearchParams({ kind: input.returnTo?.kind ?? "order", ...(input.returnTo?.id ? { id: input.returnTo.id } : {}) }).toString();
  return paypalFetch("/v2/checkout/orders", { method: "POST", body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ description: input.description, amount: { currency_code: input.currency ?? "USD", value: input.amount.toFixed(2) } }], application_context: { brand_name: "ClearSend", user_action: "PAY_NOW", return_url: `${appBase()}/paypal/return?${q}`, cancel_url: `${appBase()}/paypal/cancel?${q}` } }) }, await getPayPalAccessToken());
}

export async function captureOrder(orderId: string) { return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: "{}" }, await getPayPalAccessToken()); }

export async function getOrder(orderId: string) { return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {}, await getPayPalAccessToken()); }

export async function refundCapture(captureId: string, amount?: { value: string; currency: string }, note?: string) {
  const token = await getPayPalAccessToken();
  const body = amount ? JSON.stringify({ amount, note_to_payer: note }) : JSON.stringify({ note_to_payer: note });
  return paypalFetch(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", body }, token);
}
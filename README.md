# ClearSend

![ClearSend social preview](public/clearsend-social.svg)

**Cross-border remittance and travel planning with transparent fees, powered by PayPal + AI.**

ClearSend is an AI agent for worldwide journeys: send money across borders with clear FX rates and fees, search flights, and plan complete trips in one calm conversation. Built with PayPal sandbox APIs, NVIDIA NIM / OpenRouter, AI SDK, and the PayPal Agent Toolkit. Every money-moving action requires explicit human approval.

**Live demo:** https://clearsend-sigma.vercel.app/  
**Architecture:** Next.js 15 App Router → AI SDK streaming agent → PayPal Payouts + Orders + Agent Toolkit → Duffel/RapidAPI flights → approval-gated sandbox execution

---

## Quick start for reviewers

### Golden prompts (working with UI chips)

Try these in the live demo or after local setup:

1. **"Send $500 to Lagos, Nigeria with transparent fees"**  
   Agent calculates remittance breakdown (fee, FX rate, amount received), then asks for recipient email for PayPal sandbox payout approval.

2. **"Search flights from New York to Lagos"**  
   Agent searches real flight offers via Duffel/RapidAPI and presents airline, price, duration, stops.

3. **"Plan a journey: remittance + flight in one conversation"**  
   Agent handles both tools, shows combined total, and requests separate approval for payout and flight order.

### Required environment variables

| Variable | Purpose | How to get |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal sandbox app client ID | [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/) → Apps & Credentials → Sandbox → Create App |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app secret | Same dashboard |
| `CLEAR_SEND_API_KEY` | Server-side auth for `/api/payouts` and `/api/orders` routes | Generate any strong random string (e.g. `openssl rand -hex 32`). **Do not commit this.** Only used when calling money routes directly (agent tools handle auth internally). |
| `NVIDIA_API_KEY` **or** `OPENROUTER_API_KEY` | AI provider for the agent | NVIDIA: [build.nvidia.com](https://build.nvidia.com/) (free tier). OpenRouter: [openrouter.ai](https://openrouter.ai/). Agent tries NVIDIA first, falls back to OpenRouter if NVIDIA fails. **At least one is required.** |

**Current working models (verified Nov 2026):**
- **NVIDIA:** `meta/llama-3.3-70b-instruct` (default, free tier)
- **OpenRouter:** `meta-llama/llama-3.1-8b-instruct` (default, requires credits)

**Note:** Some models were deprecated/EOL:
- ❌ `meta/llama-3.1-405b-instruct` (404 - doesn't exist)
- ❌ `meta/llama-3.1-8b-instruct` on NVIDIA (410 Gone - EOL Aug 2026)
- ❌ `meta-llama/llama-3.1-8b-instruct:free` on OpenRouter (unavailable)

**Optional:** `DUFFEL_API_KEY`, `RAPIDAPI_KEY`, `AVIATIONSTACK_API_KEY` for flight search. Agent gracefully degrades if flight providers are unavailable.

### Sandbox receiver email for payout demos

Use a **sandbox Personal account email** from [developer.paypal.com/dashboard → Sandbox → Accounts](https://developer.paypal.com/dashboard/accounts). Fake emails like `test@example.com` will return `DENIED` / `FAILED` status.

Example: `sb-yoursandbox47@personal.example.com` (replace with your actual sandbox account).

### How to verify locally

```bash
npm install
cp .env.example .env.local
# Add your PayPal sandbox credentials, NVIDIA or OpenRouter key, and CLEAR_SEND_API_KEY
npm run dev
```

Open http://localhost:3000 and try a golden prompt. The agent should:
- Stream responses (no generic "An error occurred")
- Show remittance cards with fee/FX breakdown
- Show flight cards with real offers (if flight keys configured)
- Display approval bar before any PayPal action
- Return payout batch ID or order ID after approval

### How to verify on Vercel after merge

1. Deploy to Vercel and add the same env vars under **Project Settings → Environment Variables** (Production + Preview).
2. Redeploy or trigger a new deployment.
3. Visit the live URL and try a golden prompt.
4. Check **Vercel Dashboard → Functions → Logs** if the agent returns errors. Look for:
   - `No AI provider is configured` → missing `NVIDIA_API_KEY` / `OPENROUTER_API_KEY`
   - `PayPal sandbox credentials are not configured` → missing `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`
   - `422` on order capture → order was not approved by user in PayPal sandbox (expected flow: create → user approves → capture)

---

## The Room flow (one workflow for everyone)

ClearSend's home page (`/`) is the **Room**: a live activity feed, a 9-step workflow stepper with live counts, and the latest trips and escrows. The agent chat (voice + document upload) moved to **`/agent`**.

| # | Step | Where | Who |
|---|------|-------|-----|
| 1 | Search flights | `/plan`, `/agent`, MCP | anyone |
| 2 | Choose | agent asks "Which flight would you like?" | payer |
| 3 | Confirm | traveller details, price breakdown, typed "yes, book it" | payer |
| 4 | Pay with PayPal | PayPal sandbox approve, then `/paypal/return` and type `CAPTURE` | payer |
| 5 | Escrow funded | `/escrow/new` (live FX quote) then payer role view, type the amount to fund | payer |
| 6 | Deliverable submitted | recipient role view, Telegram | recipient |
| 7 | AI verified | free model checks each criterion | agent + verifier |
| 8 | Human release | payer types the exact amount (web) or presses a button and types it (bots) | payer |
| 9 | Paid out | PayPal Payout to any supported country | PayPal |

- **Activity log:** `lib/activity.ts` writes real entries to Upstash (`cs-activity:*`) on every escrow and trip state change, flight search, and Telegram bot action. `GET /api/activity?kind=&subject=&q=` is public without raw payloads; `POST` (agent status) and `DELETE ?id=|?subject=` (test cleanup) need `x-clearsend-api-key`. Empty states are honest; nothing is seeded.
- **PayPal return/cancel:** orders return to `/paypal/return?kind=escrow|trip|order&id=…` and `/paypal/cancel`. These URLs never carry a role or trip token. Role links are kept only on the payer's device.
- **Prices:** `/plan` books only live Sky-Scrapper or Duffel (test) fares. Open-data results are labelled "fare unavailable" and cannot be booked.
- **Theme:** ClearSend white and blue by default, optional dark mode for Room pages (toggle in the nav), mobile menu below 1024px.

## Voice and document upload

- **Voice (browser-only, free):** hold 🎙 in the agent chat to dictate with the Web Speech API `SpeechRecognition`; the live transcript shows before you send. Toggle **🔊 Speak replies** to hear answers via `speechSynthesis`, with a stop button. Language selector covers en-NG, en-US, en-GB, fr-FR, es-ES, pt-BR, yo-NG, ha-NG, sw-KE (support varies by browser). Unsupported browsers (e.g. Firefox) show a fallback message; typing always works.
- **Chat attachments:** 📎 PDF, DOCX, TXT/MD, PNG/JPG/WEBP, max 5 MB (Vercel caps request bodies at 4.5 MB, so the UI rejects larger files up front). `POST /api/documents/extract` (multipart `file`) returns extracted text; nothing is stored. The text is sent to the agent inside `<untrusted_document>` tags and the system prompt treats it as data, never instructions.
- **Escrow documents:** `POST /api/escrow/upload` (multipart `escrowId`, `role`, `token`, `kind=spec|deliverable`, `file`). Payer uploads the spec while the escrow is `created`/`funded`; recipient uploads the deliverable while `funded`. Role tokens are required (or `x-clearsend-api-key`). Extracted text (max 20,000 chars per file, 6 files per escrow) is stored in the escrow record in Upstash Redis. Vercel Blob is not configured, so original files are not kept. The public `/api/escrow/list` strips document text.
- **Verifier:** `/api/escrow/verify` fences spec and deliverable text as untrusted, tells the model to flag injection attempts, and rejects deliverables with no readable text.
- **Extraction:** `unpdf` for PDFs (text layer only, scans give no text), `mammoth` for DOCX, UTF-8 for TXT, `tesseract.js` OCR for images. OCR downloads its language data at runtime; if that fails on the serverless function the UI says so and asks for a text format.

## Paying in the PayPal sandbox (testers)

ClearSend uses PayPal's **sandbox**, so the checkout only accepts sandbox test accounts or sandbox test cards. Real PayPal logins and real cards fail, and there is no public sign-up inside the sandbox. ClearSend shows a "Sandbox test payment" panel before redirecting, on the funding step only (escrow funding and trip payment; the app has no setup/help pages, this README is the setup guide), and the Telegram approval DM carries the same hint.

- **Test buyer login:** set `SANDBOX_BUYER_EMAIL` and `SANDBOX_BUYER_PASSWORD` (a throwaway sandbox Personal account) in Vercel. They are shown with copy buttons only while `PAYPAL_ENV` is unset or `sandbox`.
- **Create a sandbox buyer:** log in at <https://developer.paypal.com/dashboard/accounts>, click **Create account**, choose **Personal**, pick a country, then open the account's ⋮ menu → **View/Edit account** to read or set its email and password.
- **Guest card:** orders are created with `payment_source.paypal.experience_context` (`landing_page: GUEST_CHECKOUT`, `user_action: PAY_NOW`, `shipping_preference: NO_SHIPPING`). Where PayPal shows "Pay with Debit or Credit Card", a documented sandbox test card such as Visa `4012 8888 8888 1881` with any future expiry and CVV can be tried ([card testing docs](https://developer.paypal.com/tools/sandbox/card-testing/)). PayPal decides whether the guest option appears. Set `PAYPAL_EXPERIENCE=legacy` to revert to `application_context`.
- **Resilience:** cancelling returns to `/paypal/cancel` with a retry link; capture errors (`ORDER_NOT_APPROVED`, `INSTRUMENT_DECLINED`, expired orders) are mapped to clear next steps with Retry capture / Start funding again.

## Cross-border payouts (PayPal Payouts, sandbox)

Escrow release sends a **PayPal Payout** to the recipient's **PayPal account** identified by `EMAIL`, `PHONE` (E.164, e.g. `+254712345678`) or `PAYPAL_ID` (`recipient_type` in the [Payouts API](https://developer.paypal.com/docs/api/payments.payouts-batch/v1/)). The country list and currencies are taken from PayPal's [Payouts country and currency availability](https://developer.paypal.com/docs/payouts/standard/reference/country-feature/) page and encoded in `lib/payout-countries.ts`; web (`/escrow/new` selects), the agent `createEscrow` tool and Telegram (`/escrow` country step) all validate against it and return a clear error for unsupported countries or currencies.

Honest limitations:
- **Not every country.** Countries missing from PayPal's list cannot receive payouts. **Nigeria (NG) and Ghana (GH) are not on PayPal's Payouts list**, so ClearSend rejects them instead of pretending.
- **PayPal accounts only, no direct bank payouts.** Money lands in the recipient's PayPal balance; they withdraw to their local bank (or card) from PayPal where PayPal supports it.
- **Currency.** ClearSend pays in the escrow currency (one of PayPal's payout currencies). Some countries on the list can only receive USD. The FX quote shown to all parties (`receiveCurrency`) is indicative; PayPal converts with its own rate and spread.
- **Unclaimed payouts.** If the email/phone has no PayPal account, the item is `UNCLAIMED`; PayPal notifies the recipient and **returns the funds to the sender after 30 days** if not claimed. The escrow page refreshes the payout status and explains `UNCLAIMED`, `RETURNED`, `FAILED`, `BLOCKED` and `ONHOLD`.
- **Sandbox only.** No real money moves.

## Privacy: per-visitor data (no sign-up)

Each browser gets a random, unguessable anonymous id (`cs_uid`, 128-bit, `httpOnly`, `Secure` on HTTPS, `SameSite=Lax`, 1-year expiry) issued by `middleware.ts`. Escrows, trips, receipts and activity created from the web or the agent chat are stamped with `ownerId`. `/escrow`, `/trips`, `/api/escrow/list`, `/api/trips/list`, `/api/activity`, the home Room and the agent `listEscrows`/`getEscrow` tools return only the caller's own records.

- A specific escrow is still opened with its signed **role link** (`?role=&token=`); no token → 401, wrong token → 403. A visitor who opens a valid role link gets that one escrow in their own "shared with you" list (stored server-side as `shared:<cs_uid>`). Receipts stay token-gated.
- Trips are visible only to the browser that created them (`GET /api/trips/:id` returns 404 to anyone else).
- Telegram escrows are owned by `telegram:<chatId>`; they never appear in any browser's lists. MCP agent tools run as `mcp:service` and never see browser or Telegram records; without `CLEAR_SEND_API_KEY` configured, MCP data tools return 401.
- **Legacy records** created before this change have no `ownerId` and are hidden from every visitor (not deleted; still reachable by role link or the service key).
- **History lives with the browser.** Clearing cookies or switching devices starts an empty list; open your role links to bring escrows back as "shared with you". There is no account sign-in yet.

## AI spec extraction from documents

`POST /api/spec/extract` (multipart `file`, or JSON `{name,text}`; zod-validated; 8 requests/min per IP) reads the document and asks the free OpenRouter model (`OPENROUTER_MODEL`, then `OPENROUTER_FALLBACK_MODELS`, default `google/gemma-4-31b-it:free,nvidia/nemotron-3.5-lightning:free`) for a structured spec: title, summary, deliverables, measurable acceptance criteria, deadline, amount/currency/recipient if stated, and ambiguities. The document is fenced as untrusted data; injected instructions are flagged and never become criteria; vague documents return `clearSpec: false` with what is missing. The payer reviews and edits it ("Here is what I understood: confirm or edit") before the escrow is created on `/escrow/new`, from the agent chat ("Use as escrow spec" on an attachment) or in Telegram (send the document during `/escrow`). The confirmed spec is stored as `structuredSpec`, shown on every role page and given to the verifier with the original document text.

## Payment receipts

Every real PayPal sandbox event issues a receipt, persisted on the escrow or trip record at that moment (`receipts[]`): funding capture, release payout and refund (trips: payment capture and auto-refund). Fields: receipt number, escrow/trip id, time in UTC and Lagos (WAT), payer, recipient, amount, currency, fee (2.5% escrow; trips use their stored 3% service fee), live FX mid-market rate, 1.2% spread and destination amount (quote at event time, when the recipient country maps to a currency), PayPal order id, capture id, payout batch/item id or refund id, PayPal status, and the label "PayPal Sandbox - test payment, no real money". Nothing is seeded.

- `/receipt/<id>?role=&token=`: printable receipt (Download PDF uses the browser print-to-PDF stylesheet), copy-link. Same HMAC role tokens as escrow routes; trips accept the payer token.
- `/receipts?escrow=&role=&token=` and the **Receipts** card on each escrow role page.
- `GET /api/receipts/<id>?role=&token=` (401 missing, 403 wrong token) or `x-clearsend-api-key`.
- MCP tool `getReceipt` (`id`, or `escrowId`/`tripId` to list).
- Telegram: on fund, release and refund the group gets a token-free summary; the payer gets a DM with their private receipt link. An activity entry is written for each receipt.

## Use ClearSend in Telegram

Add ClearSend to a Telegram group and run the same PayPal-backed escrow in the conversation. The bot is serverless: Telegram uses a webhook (`POST /api/telegram/webhook`). No long-running bot process. The in-app `/chat-bots` page only shows add-to-chat links; setup lives in this README.

**Flow:** payer creates the escrow (becomes payer) -> recipient/verifier join with an invite code or their ClearSend role link (roles bound to the chat user id) -> payer funds via a PayPal sandbox approval link (sent privately) and presses "I approved" to capture -> recipient submits text or a file (PDF/DOCX/TXT/image, read by `lib/documents.ts`) -> AI verifier (`lib/verifier.ts`, free OpenRouter/NVIDIA model, documents treated as untrusted) -> payer presses **Confirm release** and types exactly `RELEASE <amount> <CUR>` -> PayPal Payout. Refund (payer or verifier) needs `REFUND <amount> <CUR>`.

**Guards:** release only by the payer and only when the escrow is `verified`; the role is re-checked when money moves; confirmations expire after 10 minutes and run once; per-user rate limit (20/min); Telegram `update_id` idempotency; activity log at `clearsend:chat:activity`; all mappings in Upstash under `clearsend:chat:`; PayPal sandbox only; tokens never logged.

### Telegram (BotFather)
1. Message **@BotFather** -> `/newbot` -> pick a name and a username ending in `bot`. Copy the token.
2. Optional: `/setjoingroups` -> Enable. Leave `/setprivacy` **Enabled**: the bot only needs commands and replies to its own prompts (guided steps use force-reply).
3. Vercel env (Production + Preview): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (random, `A-Z a-z 0-9 _ -`, e.g. `openssl rand -hex 32`), `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (without @). Redeploy.
4. Register the webhook and command menu:
   ```bash
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-set-webhook.mjs https://clearsend-sigma.vercel.app
   ```
5. Add the bot to a group with `https://t.me/<bot>?startgroup=true`. Commands: `/escrow`, `/escrow 150 USD to Ada <ada@example.com> for 3 logo concepts`, `/join <code>`, `/status`, `/fund`, `/submit` (text, or reply to a document/photo), `/verify`, `/release`, `/refund`, `/quote 100 USD NGN`, `/cancel`, `/help`. Invite links `https://t.me/<bot>?start=<code>` join from a DM. Each party should press Start in a DM once so private links (PayPal approval, role link) can be delivered; otherwise the PayPal approval link falls back to the group.

Tests: `npm test` (Telegram secret, parsing, role mapping and guards, webhook 401, receipt builder).


## PayPal webhooks

Webhook URL: `https://clearsend-sigma.vercel.app/api/webhooks/paypal`

1. developer.paypal.com → Apps & Credentials → your sandbox app → Webhooks → Add webhook with the URL above.
2. Subscribe to: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.BLOCKED`, `PAYMENT.PAYOUTS-ITEM.RETURNED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`, `PAYMENT.PAYOUTS-ITEM.HELD`, `PAYMENT.PAYOUTS-ITEM.REFUNDED`, `PAYMENT.PAYOUTS-ITEM.CANCELED`.
3. Set `PAYPAL_WEBHOOK_ID` (the Webhook ID PayPal shows) in Vercel Production and Preview.

Every delivery is verified with PayPal's `POST /v1/notifications/verify-webhook-signature` (transmission headers + `PAYPAL_WEBHOOK_ID`; sandbox or live base per `PAYPAL_ENV`). Missing ID, missing headers or a failed check returns 401 (fail closed). Events are deduplicated on event id in Upstash (30 day TTL).

What a webhook may do: confirm funding of a `created` escrow when PayPal reports the capture completed; record a refund PayPal already made; record the latest payout status on a released escrow and its receipt; add activity-feed entries; post a Telegram warning when a payout fails, is returned, unclaimed, held, blocked, refunded or cancelled. What it never does: move an escrow backwards, start a capture, payout or refund, or release funds (release stays human-confirmed). Records are matched via `custom_id` (`escrow:<id>` / `trip:<id>`) on orders, PayPal order/capture ids, payout batch id and `sender_item_id` (escrow id). Trip events are logged to the activity feed only.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Flight search uses the configured worldwide provider chain. PayPal actions require sandbox credentials and an NVIDIA key for the agent.

## Environment variables

| Variable | Description | Required |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal sandbox app client ID | **Yes** (for money) |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app secret | **Yes** (for money) |
| `CLEAR_SEND_API_KEY` | Server-side auth token for `/api/payouts` and `/api/orders` direct calls. Generate a strong random string. Not needed for agent tool execution (agent handles auth internally). If not set, money routes log a warning but remain unprotected. | **Recommended** |
| `NVIDIA_API_KEY` | NVIDIA NIM API key | **Yes** (or use OpenRouter) |
| `NVIDIA_BASE_URL` | Optional base URL; defaults to `https://integrate.api.nvidia.com/v1` | No |
| `NVIDIA_MODEL` | Optional model; defaults to `meta/llama-3.3-70b-instruct` (Nov 2026 - current, free tier). **DO NOT use deprecated models:** `meta/llama-3.1-405b-instruct` (404), `meta/llama-3.1-8b-instruct` (410 EOL Aug 2026) | No |
| `OPENROUTER_API_KEY` | Optional fallback key from [openrouter.ai](https://openrouter.ai/). Agent tries NVIDIA first, then falls back to OpenRouter if NVIDIA fails. | **Yes** (if no NVIDIA) |
| `OPENROUTER_BASE_URL` | Optional base URL; defaults to `https://openrouter.ai/api/v1` | No |
| `OPENROUTER_MODEL` | Optional fallback model; defaults to `meta-llama/llama-3.1-8b-instruct` (requires credits). **DO NOT use:** `meta-llama/llama-3.1-8b-instruct:free` (unavailable Nov 2026) | No |
| `DUFFEL_API_KEY` | Duffel test-mode token; primary flight provider | No |
| `RAPIDAPI_KEY` | RapidAPI key for Sky Scrapper backup flight search | No |
| `AVIATIONSTACK_API_KEY` | Aviationstack free-tier key for route/schedule backup | No |
| `KERNEL_API_KEY` | Optional Kernel browser key for the last-resort browser search | No |
| `KERNEL_API_URL` | Optional Kernel browser endpoint; defaults to `https://api.onkernel.com/v1/browser/sessions` | No |
| `ENABLE_KERNEL_FALLBACK` | Set to `true` to opt into browser fallback after all APIs fail | No |
| `NEXT_PUBLIC_APP_URL` | **Public app URL** for escrow links and payment redirects. Use your production URL (e.g. `https://clearsend.vercel.app`) in production. Never use `localhost` in deployed environments. Falls back to `VERCEL_PROJECT_PRODUCTION_URL` if not set. | **Recommended** |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL for escrow storage | **Yes** (for escrow) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | **Yes** (for escrow) |
| `ESCROW_LINK_SECRET` | Secret key for generating secure escrow role tokens. Generate with `openssl rand -hex 32`. Falls back to a default (insecure) value in development. | **Recommended** (production) |

## PayPal Escrow

ClearSend includes a complete PayPal sandbox escrow system for secure payments with deliverable verification. Use it for freelance jobs, service agreements, or any transaction requiring proof of delivery before release.

### Escrow Flow

1. **Create Escrow**: Agent or user creates an escrow with payer, recipient (email or PayPal payer ID, country, currency), amount, and a written specification with acceptance criteria.
2. **Fund Escrow**: Funds are deposited into the platform's PayPal account via PayPal Orders v2 (create → payer approval → capture). Escrow state becomes 'funded' only after capture is COMPLETED.
3. **Submit Deliverable**: Recipient submits deliverable (text/URL/notes) for evaluation.
4. **Verify Deliverable**: Agent evaluates the deliverable against the specification using an LLM with structured output (met: boolean, reasons, per-criterion results). No auto-release without a passing evaluation.
5. **Approve Release**: Human approval step (ApprovalBar) before any payout is sent.
6. **Release Funds**: On approved release, funds are sent via PayPal Payouts API to the recipient's PayPal email/phone/payer ID in any supported country/currency. Payout batch ID and status are recorded.
7. **Refund Path**: If spec is not met or user cancels, the captured payment is refunded via `/v2/payments/captures/{id}/refund`.

### Escrow State Machine

`created` → `funded` → `submitted` → `verified|rejected` → `released|refunded`

State transitions are idempotent and never double-pay.

### Escrow Storage

Escrow records are persisted server-side in Upstash Redis (via env `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). If not configured, falls back to in-memory storage with a warning (data lost on restart).

**Recommended**: Use Upstash Redis REST for production. Create a free database at [console.upstash.com](https://console.upstash.com/), copy the REST URL and token, and add them to your environment variables.

### Escrow API Routes

- `POST /api/escrow/create` - Create a new escrow
- `POST /api/escrow/fund` - **payer** only. Without `orderId`: creates a PayPal order with `custom_id: escrow:<id>`. With `orderId`: ClearSend reads the order from PayPal and captures only if `custom_id`, amount and currency match this escrow, the order is approved, and the order isn't bound to another escrow
- `POST /api/escrow/submit` - **recipient** only
- `POST /api/escrow/verify` - **verifier** only (or the service key)
- `POST /api/escrow/release` - **payer** only, after AI verification. Body must include `confirmation: "RELEASE <amount> <CUR>"` (e.g. `RELEASE 5.00 USD`), checked on the server; otherwise 400
- `POST /api/escrow/refund` - **payer or verifier** (same rule as Telegram). Body must include `confirmation: "REFUND <amount> <CUR>"`

**Authorization:** every per-escrow call needs `role` + `token` from that role's link (no credential -> 401; bad token or a role that may not do the action -> 403), the `x-clearsend-api-key` service key, or the creator's own browser cookie, which counts as the payer (the creator is the payer). **Double-spend protection:** fund, release and refund run under a per-escrow Redis lock (`SET NX EX`), re-read state inside the lock, and release/refund take a permanent one-way settlement claim (`SET NX`), so an escrow is paid out or refunded once, never both. A PayPal order is bound to one escrow (`SET NX`).
- `GET /api/escrow/[id]` - Get escrow details by ID

### Escrow Agent Tools

- `createEscrow` - Create a new escrow
- `getEscrow` - Get escrow details by ID
- `listEscrows` - List all escrows (newest first)

### Escrow UI Component

`EscrowCard` displays escrow state, timeline, amounts, specification, deliverable (if submitted), and evaluation results.

### Testing Escrow in Sandbox

1. Create an escrow with specification and acceptance criteria
2. Use the returned escrow ID to fund it (creates PayPal order)
3. Approve the order in PayPal sandbox
4. Capture the order to move escrow to 'funded' state
5. Submit a deliverable for verification
6. Verify the deliverable (LLM evaluates against criteria)
7. If verified, approve release (human approval step)
8. Funds are sent via PayPal Payouts to recipient

**Note**: All PayPal operations use sandbox mode. Never send real money outside the PayPal sandbox unless env is explicitly live.

## Get credentials

### PayPal sandbox (required for money actions)

1. Sign in at [developer.paypal.com](https://developer.paypal.com/dashboard/).
2. Open **Apps & Credentials**, switch to **Sandbox**, and create an app.
3. Copy the app's Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Create a sandbox **Personal account** under **Sandbox → Accounts** for the recipient email used during payout approval. Use the email from this account in your demo (e.g. `sb-yoursandbox47@personal.example.com`). **Fake emails will fail.**
5. Every PayPal request is hard-coded to `api-m.sandbox.paypal.com`.

### NVIDIA NIM (recommended AI provider)

1. Create a free account at [build.nvidia.com](https://build.nvidia.com/).
2. Create an API key from the account menu.
3. Set it as `NVIDIA_API_KEY`. The agent uses model `meta/llama-3.1-405b-instruct` by default (free tier).

### OpenRouter fallback (alternative AI provider)

1. Create an account at [openrouter.ai](https://openrouter.ai/).
2. Create an API key and set it as `OPENROUTER_API_KEY`.
3. The agent uses `meta-llama/llama-3.1-8b-instruct:free` by default. ClearSend uses NVIDIA when `NVIDIA_API_KEY` is set and automatically selects OpenRouter when it is unavailable.

## Worldwide flight providers

ClearSend tries providers in this order and returns the first non-empty result:

1. **RapidAPI Sky Scrapper** via `RAPIDAPI_KEY` - Real-time pricing with retry logic and caching
2. **Duffel** test mode via `DUFFEL_API_KEY` - Test/sample flight data
3. **Aviationstack** via `AVIATIONSTACK_API_KEY` - Live flight status (schedule only, no pricing)
4. **OpenSky Network** (free, anonymous) - Real recent/live departures and arrivals per airport (schedule only, no pricing)
5. **OpenFlights** database (free, GitHub-hosted) - Route database to confirm which airlines fly a route (schedule only, no pricing)
6. Optional **Kernel browser** fallback, only when `ENABLE_KERNEL_FALLBACK=true` and `KERNEL_API_KEY` is configured

### Honest pricing policy

**ClearSend NEVER fabricates prices.** Flight offers are clearly labeled:

- **Priced offers** from RapidAPI or Duffel show real fares and can be booked with PayPal
- **Schedule-only offers** from Aviationstack, OpenSky, or OpenFlights show `price: null` and are labeled "schedule only - fare unavailable"
- The agent honestly explains when a fare is unavailable and offers to get a priced quote via RapidAPI/Duffel when available
- **Booking/payment requires a priced offer** - the agent will not attempt PayPal checkout for schedule-only flights and explains it can't charge without a real fare

The agent accepts IATA codes or city names and returns airline, price (if available), times, stops, and duration. Provider errors are logged and the next provider is tried. If all providers fail, ClearSend returns a clear error instead of inventing an offer.

### Free provider keys

- **RapidAPI:** create a free account at [rapidapi.com](https://rapidapi.com), subscribe to the Sky Scrapper / Air Scraper BASIC plan, and copy `RAPIDAPI_KEY`. **Real-time pricing with retry logic and caching.**
- **Duffel:** create a test account at [duffel.com](https://duffel.com), then copy a `duffel_test_` token from the dashboard. **Test/sample data only.**
- **Aviationstack:** create a free account at [aviationstack.com](https://aviationstack.com) and copy the access key. **Live flight status, schedule only, no pricing.**
- **OpenSky Network:** **Free, no signup required.** Anonymous access to real recent/live flight data. Optional: set `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` for higher rate limits. **Schedule only, no pricing.**
- **OpenFlights:** **Free, no signup required.** Route database from [github.com/jpatokal/openflights](https://github.com/jpatokal/openflights) fetched and cached server-side. **Schedule only, no pricing.**
- **Kernel:** create an account at [onkernel.com](https://onkernel.com), copy the API key, and explicitly enable the fallback flag. Browser search is never the default.

**Important:** Only RapidAPI and Duffel provide pricing. All other providers return schedule-only data with `price: null` and are labeled "schedule only - fare unavailable". The agent will not attempt PayPal checkout for schedule-only flights.

For a complete conversation, ask ClearSend to calculate a transfer and find a flight in one request. It will show both results, a combined total, and separate approval controls before any PayPal action.

## Deploy to Vercel

Import this repository into Vercel, add the variables above under **Project Settings → Environment Variables** for Preview and Production, and deploy. The App Router API routes are deployed as serverless functions. Set `NEXT_PUBLIC_APP_URL` to the final Vercel URL.

**Required for working demo:**
- `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` (sandbox)
- `NVIDIA_API_KEY` or `OPENROUTER_API_KEY`
- `CLEAR_SEND_API_KEY` (recommended for money route protection)

**Optional for flight search:**
- `DUFFEL_API_KEY`, `RAPIDAPI_KEY`, or `AVIATIONSTACK_API_KEY`

Keep the PayPal credentials in sandbox mode; this app rejects non-sandbox PayPal URLs.

For CLI deployment, run `npx vercel`, then add variables with `vercel env add`.

## GitHub

Create the public repository and push the project with GitHub CLI:

```bash
gh auth login
gh repo create clearsend-journey --public --source=. --remote=origin --push
```

Or create an empty public repository named `clearsend-journey` in GitHub, then run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/clearsend-journey.git
git add .
git commit -m "Build ClearSend Journey Agent"
git branch -M main
git push -u origin main
```

## API safety

**Agent tool execution:** The agent's `createPayout` and `createOrder` tools require explicit user approval before execution. The UI displays an approval bar; nothing moves until the user clicks "Approve action."

**Direct API routes:** `/api/payouts` and `/api/orders` are protected by `CLEAR_SEND_API_KEY`. If the env var is set, direct calls require a matching `x-clearsend-api-key` header (returns `401` otherwise). If `CLEAR_SEND_API_KEY` is not set, a warning is logged and the routes remain unprotected for demo purposes. **Agent tool execution does not call these routes directly**—tools use the PayPal SDK internally with server-side credentials.

**Orders flow:** `createOrder` creates a PayPal order and returns an `approveUrl`. The user must open this URL in PayPal sandbox and approve the payment. After approval, call `captureOrder` to finalize. Auto-capture without user approval fails with `422`.

**Credentials:** All PayPal and AI provider secrets stay server-side. Never expose them through `NEXT_PUBLIC_` variables.

---

## PayPal + AI: Agentic Commerce at Work

ClearSend demonstrates **PayPal + AI** by building an autonomous agent that handles real money movement with human-in-the-loop approval. This section documents the deep integration of PayPal's agentic commerce capabilities.

### 🎯 Core Concept

Every PayPal action flows through the **@paypal/agent-toolkit**, is tracked in real-time via the **PayPal Activity Panel**, and requires explicit user consent before execution. No mock data—all transactions hit real PayPal sandbox endpoints.

### 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ClearSend Agent Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  AI SDK     │→ │  PayPal      │→ │  Custom Remittance  │   │
│  │  Stream     │  │  Toolkit     │  │  Flight + Escrow    │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│                           ↓                                      │
│              ┌────────────────────────────┐                     │
│              │  Approval Gate (UI)        │                     │
│              │  Human-in-the-Loop         │                     │
│              └────────────────────────────┘                     │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                   PayPal Sandbox APIs                            │
│  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Orders     │  │ Payouts    │  │ Invoices │  │ Products   │ │
│  │ Disputes   │  │ Payments   │  │ Refunds  │  │ Subscript. │ │
│  └────────────┘  └────────────┘  └──────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│              External Agent Integration                          │
│  MCP-over-HTTP: /.well-known/ai-plugin.json + /api/mcp         │
│  Protected by x-clearsend-api-key header                        │
└─────────────────────────────────────────────────────────────────┘
```

### 🔧 PayPal APIs & Tools Used

**Orders API:**
- `POST /v2/checkout/orders` (create)
- `POST /v2/checkout/orders/:id/capture`
- `GET /v2/checkout/orders/:id`
- `POST /v2/checkout/orders/:id/authorize`
- Toolkit: `paypal_create_order`, `paypal_get_order`, `paypal_capture_order`

**Payouts API:**
- `POST /v1/payments/payouts` (create)
- `GET /v1/payments/payouts/:id` (status)
- Toolkit: `paypal_create_payout`, `paypal_get_payout`

**Invoices API:**
- `POST /v2/invoicing/invoices` (create)
- `POST /v2/invoicing/invoices/:id/send`
- `GET /v2/invoicing/invoices`
- Toolkit: `paypal_create_invoice`, `paypal_send_invoice`, `paypal_list_invoices`

**Products API:**
- `POST /v1/catalogs/products` (create)
- `GET /v1/catalogs/products`
- Toolkit: `paypal_create_product`, `paypal_list_products`

**Disputes API:**
- `GET /v1/customer/disputes`
- `GET /v1/customer/disputes/:id`
- Toolkit: `paypal_list_disputes`, `paypal_get_dispute`

**Custom Tools:**
- `calculateRemittance` with pre-formatted display strings
- `searchFlights` with cheapest-offer marking
- `createPayout` (approval-gated wrapper)
- `createOrder` (approval-gated wrapper)
- `captureOrder`
- `getStatus` (unified payout/order status)

### 📊 PayPal Activity Timeline

The **PayPalActivityPanel** component tracks every PayPal tool call in real-time:

- **Tool Name:** createPayout, createOrder, paypal_create_invoice, etc.
- **Sanitized Args:** Redacts sensitive data (email partially masked, no secrets)
- **PayPal IDs:** Batch ID, Order ID, Invoice ID from responses
- **Status:** pending → approved → success/failed
- **Latency:** Milliseconds from tool call to response

This panel is visible in the right sidebar of the chat interface and expands to show full activity details.

### 🔌 Agent-Readable Endpoint

ClearSend exposes an **MCP-over-HTTP** endpoint so external agents can call its PayPal-backed tools:

**Discovery:**
```bash
GET /.well-known/ai-plugin.json
```

Returns agent capabilities, endpoints, and available tools.

**List Tools:**
```bash
POST /api/mcp
Content-Type: application/json
x-clearsend-api-key: <your-key>

{
  "method": "tools/list"
}
```

**Call Tool:**
```bash
POST /api/mcp
Content-Type: application/json
x-clearsend-api-key: <your-key>

{
  "method": "tools/call",
  "params": {
    "name": "calculateRemittance",
    "arguments": {
      "amount": 500,
      "destination": "Lagos, Nigeria",
      "currency": "USD",
      "midMarketRate": 1348.45,
      "receiveCurrency": "NGN"
    }
  }
}
```

### 🧪 Sandbox Test Walkthrough

**Prerequisites:**
1. PayPal Developer Account at [developer.paypal.com](https://developer.paypal.com/dashboard/)
2. Create a Sandbox App under Apps & Credentials → Sandbox
3. Copy Client ID and Secret to `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
4. Create a Sandbox Personal Account for receiving payouts
5. Set `NVIDIA_API_KEY` or `OPENROUTER_API_KEY` for AI
6. Optional: `RAPIDAPI_KEY` for flight search

**Test Flow 1: Cross-Border Remittance**
1. Open ClearSend
2. Type: "Send $500 to Lagos, Nigeria with transparent fees"
3. Agent calculates breakdown with displayStrings (properly formatted with thousands separators)
4. Provide sandbox recipient email
5. Click "Approve action" in approval bar
6. Agent creates PayPal payout → batch ID returned
7. Check PayPal Activity Panel for tracked tool call

**Test Flow 2: Travel Booking**
1. Type: "Search flights from New York to Lagos"
2. Agent searches flights (RapidAPI Sky Scrapper with fixed airport lookup)
3. Agent shows cheapest offer first (marked with `isCheapest: true`)
4. Type: "Book the cheapest one"
5. Agent creates PayPal order → approval URL returned
6. Open approval URL, log in with sandbox Business account, approve
7. Return to ClearSend, confirm approval
8. Agent captures order
9. PayPal Activity Panel shows: createOrder → orderId → captureOrder → captured

**Test Flow 3: Combined Journey**
1. Type: "Plan a journey: send $500 to Lagos and book a flight from New York to Lagos"
2. Agent calls both calculateRemittance and searchFlights
3. Agent shows combined total
4. Separate approval for payout and order
5. PayPal Activity Panel tracks all operations

The architecture, sandbox walkthrough and setup previously on an in-app `/judges` page now live only in this README; `/judges` and `/paypal/help` return 404.

### ✅ What Makes This PayPal + AI

1. **Deep PayPal Integration:** Uses Orders, Payouts, Invoices, Products, Disputes, Subscriptions, Refunds via Agent Toolkit
2. **Agentic Commerce:** Agent autonomously orchestrates multi-step flows: quote → order → approval → capture → payout
3. **Real Sandbox:** Every transaction hits PayPal sandbox; visible in PayPal Developer Dashboard
4. **Human-in-the-Loop:** ApprovalBar + approval flow for all money-moving actions
5. **Activity Transparency:** Live tracking of every PayPal tool call with IDs, status, latency
6. **Agent-Readable:** MCP endpoint exposes ClearSend's PayPal tools to external agents
7. **End-to-End Flows:** Remittance, travel, escrow—complete journeys, not isolated demos
8. **No Mock Data:** Real flight APIs, real FX calculations, real PayPal responses with proper formatting

## Failed payouts and retry

If PayPal later fails, denies, returns, blocks, refunds or cancels a payout (webhook `PAYMENT.PAYOUTS-ITEM.*` / `PAYMENT.PAYOUTSBATCH.DENIED`, or the status poll on the escrow page and payout receipt), ClearSend records `payoutStatus: FAILED` with PayPal's error code in plain English, marks the payout receipt FAILED, logs an activity entry and posts to the escrow's Telegram chat. The escrow stays `released` (the release claim is permanent, so it can never also be refunded), but the page shows **Payout failed: reason** instead of claiming delivery.

The payer can retry with a corrected recipient email/country: `POST /api/escrow/retry-payout` with `{ escrowId, role, token, confirmation: "RELEASE <amount> <CUR>", recipientEmail?, recipientCountry? }`. A retry runs only under the escrow lock, only after PayPal's API confirms the current batch failed, and only once per failed batch (permanent claim; freed only if PayPal rejects the new batch with a 4xx).

# ClearSend

![ClearSend social preview](public/clearsend-social.svg)

Transparent cross-border money and travel, powered by PayPal sandbox APIs, Duffel flight offers, NVIDIA NIM, and the PayPal Agent Toolkit. ClearSend is built for worldwide journeys with approval before any money moves.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Flight search uses the configured worldwide provider chain. PayPal actions require sandbox credentials and an NVIDIA key for the agent.

## Environment variables

| Variable | Description |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app secret |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `NVIDIA_BASE_URL` | Optional base URL; defaults to `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | Optional model; defaults to `nvidia/nemotron-3-ultra-550b-a55b` |
| `OPENROUTER_API_KEY` | Optional fallback key from [openrouter.ai](https://openrouter.ai/) |
| `OPENROUTER_BASE_URL` | Optional base URL; defaults to `https://openrouter.ai/api/v1` |
| `OPENROUTER_MODEL` | Optional fallback model; defaults to `openrouter/free` |
| `DUFFEL_API_KEY` | Duffel test-mode token; primary flight provider |
| `RAPIDAPI_KEY` | RapidAPI key for Sky Scrapper backup flight search |
| `AVIATIONSTACK_API_KEY` | Aviationstack free-tier key for route/schedule backup |
| `KERNEL_API_KEY` | Optional Kernel browser key for the last-resort browser search |
| `KERNEL_API_URL` | Optional Kernel browser endpoint; defaults to `https://api.onkernel.com/v1/browser/sessions` |
| `ENABLE_KERNEL_FALLBACK` | Set to `true` to opt into browser fallback after all APIs fail |
| `NEXT_PUBLIC_APP_URL` | Public app URL for return/cancel URLs |

## Get credentials

### PayPal sandbox

1. Sign in at [developer.paypal.com](https://developer.paypal.com/dashboard/).
2. Open **Apps & Credentials**, switch to **Sandbox**, and create an app.
3. Copy the app's Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Create a sandbox Personal account under **Sandbox > Accounts** for the recipient email used during approval.
5. Every PayPal request is hard-coded to `api-m.sandbox.paypal.com`.

### NVIDIA NIM

1. Create a free account at [build.nvidia.com](https://build.nvidia.com/).
2. Create an API key from the account menu.
3. Set it as `NVIDIA_API_KEY` and keep `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`.

### OpenRouter fallback

1. Create an account at [openrouter.ai](https://openrouter.ai/).
2. Create an API key and set it as `OPENROUTER_API_KEY` in Vercel.
3. Keep `OPENROUTER_MODEL=openrouter/free`. ClearSend uses NVIDIA when `NVIDIA_API_KEY` is set and automatically selects OpenRouter when it is unavailable.

## Worldwide flight providers

ClearSend tries providers in this order and returns the first non-empty result:

1. Duffel test mode via `DUFFEL_API_KEY`.
2. RapidAPI Sky Scrapper via `RAPIDAPI_KEY`.
3. Aviationstack via `AVIATIONSTACK_API_KEY`.
4. Optional Kernel browser fallback, only when `ENABLE_KERNEL_FALLBACK=true` and `KERNEL_API_KEY` is configured.

The agent accepts IATA codes or city names and returns airline, price, times, stops, and duration. Provider errors are logged and the next provider is tried. If all providers fail, ClearSend returns a clear error instead of inventing an offer.

### Free provider keys

- **Duffel:** create a test account at [duffel.com](https://duffel.com), then copy a `duffel_test_` token from the dashboard.
- **RapidAPI:** create a free account at [rapidapi.com](https://rapidapi.com), subscribe to the Sky Scrapper / Air Scraper BASIC plan, and copy `RAPIDAPI_KEY`.
- **Aviationstack:** create a free account at [aviationstack.com](https://aviationstack.com) and copy the access key.
- **Kernel:** create an account at [onkernel.com](https://onkernel.com), copy the API key, and explicitly enable the fallback flag. Browser search is never the default.

For a complete conversation, ask ClearSend to calculate a transfer and find a flight in one request. It will show both results, a combined total, and separate approval controls before any PayPal action.

## Deploy to Vercel

Import this repository into Vercel, add the variables above under Project Settings > Environment Variables for Preview and Production, and deploy. The App Router API routes are deployed as serverless functions. Set `NEXT_PUBLIC_APP_URL` to the final Vercel URL. Keep the PayPal credentials in sandbox mode; this app rejects non-sandbox PayPal URLs.

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

The agent's payout and order tools require approval. The frontend calls the payout route only after approval and captures a flight order only after its order creation succeeds. Credentials stay server-side; never expose PayPal secrets or the NVIDIA key through `NEXT_PUBLIC_` variables.

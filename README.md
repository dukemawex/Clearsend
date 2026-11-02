# clearsend-journey

Transparent remittances and flight payments, powered by PayPal sandbox APIs and an AI travel agent. Built for the PayPal AI Hackathon with Next.js 15, the Vercel AI SDK, NVIDIA NIM, and PayPal Agent Toolkit.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Mock flight search and the calculator work without PayPal credentials. PayPal actions require sandbox credentials and an NVIDIA key for the agent.

## Environment variables

| Variable | Description |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app secret |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `NVIDIA_BASE_URL` | Optional base URL; defaults to `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | Optional model; defaults to `nvidia/nemotron-3-ultra-550b-a55b` |
| `DEMO_MODE` | Keep `true` for the hackathon sandbox demo |
| `DEMO_RECIPIENT_EMAIL` | Pre-filled PayPal sandbox recipient used when no recipient email is supplied |
| `NEXT_PUBLIC_APP_URL` | Public app URL for return/cancel URLs |

## Get credentials

### PayPal sandbox

1. Sign in at [developer.paypal.com](https://developer.paypal.com/dashboard/).
2. Open **Apps & Credentials**, switch to **Sandbox**, and create an app.
3. Copy the app's Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Create a sandbox Personal account under **Sandbox > Accounts** to use as `DEMO_RECIPIENT_EMAIL`.
5. Keep `DEMO_MODE=true`. Every PayPal request is hard-coded to `api-m.sandbox.paypal.com`.

### NVIDIA NIM

1. Create a free account at [build.nvidia.com](https://build.nvidia.com/).
2. Create an API key from the account menu.
3. Set it as `NVIDIA_API_KEY` and keep `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`.

## Demo walkthrough

Try this single multi-part prompt:

> Send $400 to my mom in Kenya for medical bills and book me a one-way flight home from Nairobi next month.

The agent calculates the fee and FX first, searches the Nairobi corridor, and presents the combined journey. Review the breakdown and flight, then approve each PayPal action separately. The remittance creates a sandbox payout; the flight creates and captures a sandbox order. Follow up with `check the status of the payout` or paste an order ID to use the status tool.

Useful shorter prompts:

- `How much will my family receive if I send $250 to Nairobi?`
- `Find a flight from SFO to Manila next month.`
- `Show me the total before I approve anything.`

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

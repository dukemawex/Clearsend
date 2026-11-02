# clearsend-journey

Transparent remittances and flight payments, powered by PayPal sandbox APIs and an AI travel agent. Built for the PayPal AI Hackathon with Next.js 15, the Vercel AI SDK, NVIDIA NIM, and PayPal Agent Toolkit.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Add PayPal sandbox credentials and an NVIDIA API key to `.env.local` for API-backed actions. Mock flight search and the calculator work without credentials.

## Environment variables

| Variable | Description |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app secret |
| `NVIDIA_API_KEY` | NVIDIA NIM API key |
| `NVIDIA_BASE_URL` | Optional base URL; defaults to `https://integrate.api.nvidia.com/v1` |
| `NEXT_PUBLIC_APP_URL` | Public app URL for return/cancel URLs |

## Deploy to Vercel

Import this repository into Vercel, add the variables above under Project Settings > Environment Variables, and deploy. The App Router API routes are deployed as serverless functions. Keep the PayPal credentials in sandbox mode; this app rejects non-sandbox PayPal URLs.

For CLI deployment, run `npx vercel`, then add variables with `vercel env add`.

## GitHub

```bash
git add .
git commit -m "Build clearsend journey hackathon app"
git push -u origin main
```
Clearsend

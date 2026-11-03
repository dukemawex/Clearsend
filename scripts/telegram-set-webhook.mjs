#!/usr/bin/env node
// Registers the ClearSend Telegram webhook.
// Usage: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-set-webhook.mjs https://your-app.vercel.app
// Also sets the bot's command menu. Never prints the token.
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = (process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
if (!token || !secret) { console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment."); process.exit(1); }
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) { console.error("TELEGRAM_WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and - (1-256 chars)."); process.exit(1); }
if (!base.startsWith("https://")) { console.error("Pass your public https app URL as the first argument."); process.exit(1); }
const api = (m, body) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const url = `${base}/api/telegram/webhook`;
const set = await api("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
console.log("setWebhook:", set.ok ? `ok -> ${url}` : set.description);
const cmds = [
  ["escrow", "Create an escrow (guided, or: 150 USD to Ada for ...)"], ["join", "Join an escrow with an invite code or role link"],
  ["status", "Show escrow status"], ["fund", "Payer: pay into escrow with PayPal"], ["submit", "Recipient: submit work (text or reply to a file)"],
  ["verify", "Run the AI verifier"], ["release", "Payer: release payout after verification"], ["refund", "Refund the payer"],
  ["quote", "FX quote: /quote 100 USD NGN"], ["cancel", "Cancel guided setup"], ["help", "How it works"],
].map(([command, description]) => ({ command, description }));
const c = await api("setMyCommands", { commands: cmds });
console.log("setMyCommands:", c.ok ? "ok" : c.description);
const me = await api("getMe", {});
if (me.ok) console.log(`Bot: @${me.result.username}  (set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${me.result.username})`);
const info = await api("getWebhookInfo", {});
if (info.ok) console.log("Webhook info:", { url: info.result.url, pending: info.result.pending_update_count, last_error: info.result.last_error_message ?? null });

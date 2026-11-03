import Link from "next/link";
import { discordInviteUrl } from "@/lib/chatbots/discord";

export const dynamic = "force-dynamic";
export const metadata = { title: "Use ClearSend in Telegram or Discord" };

function Status({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>{ok ? "Configured" : "Not configured"}: {label}</span>;
}

export default function ChatBotsPage() {
  const tgBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const tgReady = !!(tgBot && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
  const dcApp = process.env.NEXT_PUBLIC_DISCORD_APP_ID;
  const dcReady = !!(dcApp && process.env.DISCORD_PUBLIC_KEY);
  const base = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") ? process.env.NEXT_PUBLIC_APP_URL : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://<your-app>";

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold mb-2">Use ClearSend in Telegram or Discord</h1>
          <p className="text-gray-600">Add ClearSend to a group chat or server and run a PayPal-backed escrow with the payer, recipient and verifier right in the conversation. Payments are PayPal sandbox. Money only moves after the payer approves in PayPal, the AI verifier checks the work, and the payer presses confirm and types the exact words.</p>
        </header>

        <section className="rounded-xl border p-6 space-y-3">
          <h2 className="text-xl font-semibold">How an escrow runs in chat</h2>
          <ol className="list-decimal ml-6 space-y-1 text-sm">
            <li><b>Payer</b> creates it: <code>/escrow 150 USD to Ada &lt;ada@example.com&gt; for 3 logo concepts as PNG</code> (Telegram), or <code>/escrow create</code> (Discord). The bot posts invite codes for the recipient and verifier.</li>
            <li>Each party <b>joins</b> with their invite (Telegram deep link or <code>/join CODE</code>; Discord <code>/escrow join</code>) or by pasting their ClearSend role link. Roles are bound to their chat user id.</li>
            <li><b>Payer funds</b>: the bot DMs a PayPal sandbox approval link; after approving, the payer presses &quot;I approved&quot; to capture.</li>
            <li><b>Recipient submits</b> text or a file (PDF, DOCX, TXT, image). Files are read with the same document pipeline as the web app.</li>
            <li><b>AI verifies</b> the work against the spec with a free OpenRouter/NVIDIA model; document text is treated as untrusted data.</li>
            <li><b>Payer releases</b> (only if verified) with a button and the typed words <code>RELEASE 150.00 USD</code>, which sends a PayPal Payout. Payer or verifier can refund with <code>REFUND …</code>.</li>
          </ol>
          <p className="text-sm"><Link className="underline" href="/escrow">Every chat escrow also shows up on the Escrow page</Link>.</p>
        </section>

        <section className="rounded-xl border p-6 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Telegram</h2><Status ok={tgReady} label={tgBot ? `@${tgBot}` : "bot"} /></div>
          {tgBot ? (
            <div className="flex gap-3 flex-wrap">
              <a className="px-4 py-2 rounded-md bg-sky-600 text-white" href={`https://t.me/${tgBot}?startgroup=true`}>Add to a Telegram group</a>
              <a className="px-4 py-2 rounded-md border" href={`https://t.me/${tgBot}`}>Open a DM with the bot</a>
            </div>
          ) : <p className="text-sm text-gray-600">Not configured: set <code>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>, <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_WEBHOOK_SECRET</code> to enable the add-to-group link.</p>}
          <ol className="list-decimal ml-6 space-y-1 text-sm">
            <li>In Telegram, message <b>@BotFather</b>, send <code>/newbot</code>, choose a name and a username ending in <code>bot</code>. Copy the token.</li>
            <li>Optional: <code>/setjoingroups</code> → Enable. Keep <code>/setprivacy</code> Enabled (the bot only needs commands and replies to its own prompts).</li>
            <li>In Vercel set <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code> (random, letters/digits/_/-), <code>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code>, then redeploy.</li>
            <li>Run <code>node scripts/telegram-set-webhook.mjs {base}</code> to point Telegram at <code>{base}/api/telegram/webhook</code> and set the command menu.</li>
          </ol>
        </section>

        <section className="rounded-xl border p-6 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Discord</h2><Status ok={dcReady} label="application" /></div>
          {dcApp ? (
            <a className="inline-block px-4 py-2 rounded-md bg-indigo-600 text-white" href={discordInviteUrl(dcApp)}>Add to a Discord server</a>
          ) : <p className="text-sm text-gray-600">Not configured: set <code>NEXT_PUBLIC_DISCORD_APP_ID</code> and <code>DISCORD_PUBLIC_KEY</code> to enable the add-to-server link.</p>}
          <ol className="list-decimal ml-6 space-y-1 text-sm">
            <li>At <b>discord.com/developers/applications</b> → New Application. From General Information copy the <b>Application ID</b> and <b>Public Key</b>.</li>
            <li>Bot tab → Reset Token, copy the <b>bot token</b>. No privileged gateway intents are needed (the bot uses HTTP interactions only).</li>
            <li>Set Vercel env <code>DISCORD_APP_ID</code>, <code>NEXT_PUBLIC_DISCORD_APP_ID</code>, <code>DISCORD_PUBLIC_KEY</code>, <code>DISCORD_BOT_TOKEN</code>; redeploy.</li>
            <li>General Information → <b>Interactions Endpoint URL</b>: <code>{base}/api/discord/interactions</code> → Save (Discord sends a signed PING that must pass).</li>
            <li>Run <code>node scripts/discord-register-commands.mjs</code> (add a guild id for instant testing).</li>
            <li>Invite with scopes <code>bot applications.commands</code> and permissions Send Messages, Embed Links, Attach Files, Read Message History, Use Application Commands.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Use ClearSend in Telegram" };

export default function ChatBotsPage() {
  const tgBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold mb-2">Use ClearSend in Telegram</h1>
          <p className="text-gray-600">Add ClearSend to a Telegram group and run a PayPal-backed escrow with the payer, recipient and verifier right in the conversation. Payments are PayPal sandbox. Money only moves after the payer approves in PayPal, the AI verifier checks the work, and the payer presses confirm and types the exact words.</p>
        </header>

        <section className="rounded-xl border p-6 space-y-3">
          <h2 className="text-xl font-semibold">How an escrow runs in chat</h2>
          <ol className="list-decimal ml-6 space-y-1 text-sm">
            <li><b>Payer</b> creates it: <code>/escrow 150 USD to Ada &lt;ada@example.com&gt; for 3 logo concepts as PNG</code>. The bot posts invite codes for the recipient and verifier.</li>
            <li>Each party <b>joins</b> with their invite (Telegram deep link or <code>/join CODE</code>) or by pasting their ClearSend role link. Roles are bound to their chat user id.</li>
            <li><b>Payer funds</b>: the bot DMs a PayPal sandbox approval link; after approving, the payer presses &quot;I approved&quot; to capture.</li>
            <li><b>Recipient submits</b> text or a file (PDF, DOCX, TXT, image). Files are read with the same document pipeline as the web app.</li>
            <li><b>AI verifies</b> the work against the spec with a free OpenRouter/NVIDIA model; document text is treated as untrusted data.</li>
            <li><b>Payer releases</b> (only if verified) with a button and the typed words <code>RELEASE 150.00 USD</code>, which sends a PayPal Payout. Payer or verifier can refund with <code>REFUND …</code>.</li>
            <li><b>Receipts</b>: after each real PayPal sandbox capture, payout and refund the bot posts a receipt summary in the group and DMs the payer a private receipt link.</li>
          </ol>
          <p className="text-sm"><Link className="underline" href="/escrow">Escrows you create in chat stay private to that chat; open a role link to view one on the web</Link>.</p>
        </section>

        <section className="rounded-xl border p-6 space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Telegram</h2></div>
          {tgBot ? (
            <div className="flex gap-3 flex-wrap">
              <a className="px-4 py-2 rounded-md bg-sky-600 text-white" href={`https://t.me/${tgBot}?startgroup=true`}>Add to a Telegram group</a>
              <a className="px-4 py-2 rounded-md border" href={`https://t.me/${tgBot}`}>Open a DM with the bot</a>
            </div>
          ) : <p className="text-sm text-gray-600">The Telegram bot isn&apos;t available on this deployment yet.</p>}
        </section>

      </div>
    </div>
  );
}

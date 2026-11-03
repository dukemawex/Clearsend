import Link from "next/link";
import { getEscrow } from "@/lib/escrow";
import { verifyEscrowToken, type EscrowRole } from "@/lib/escrow-links";
import { KIND_TITLE, formatLagos, money } from "@/lib/receipts";
import { Room, PageHeader, Card, Empty, ErrorBox, Badge } from "@/components/room/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipts · ClearSend", robots: { index: false } };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ escrow?: string; role?: string; token?: string }> }) {
  const { escrow: id, role, token } = await searchParams;
  const authed = !!(id && role && token && ["payer", "recipient", "verifier"].includes(role) && verifyEscrowToken(id, role as EscrowRole, token));
  const escrow = authed ? await getEscrow(id!) : null;
  const receipts = [...(escrow?.receipts ?? [])].sort((a, b) => b.issuedAt - a.issuedAt);
  return (
    <Room>
      <PageHeader eyebrow="PayPal sandbox" title="Receipts">A receipt is issued only when PayPal returns a real sandbox capture, payout or refund. Nothing is seeded. Receipts are private to the escrow&apos;s payer, recipient and verifier.</PageHeader>
      {!id ? (
        <Card><p className="text-sm text-mut">Open this page from the <b>Receipts</b> section of your escrow role link, or from the private receipt link the Telegram bot sends the payer. Every escrow role page lists its receipts.</p><p className="mt-3 text-sm"><Link className="font-semibold c-acc" href="/escrow">Go to escrows →</Link></p></Card>
      ) : !authed ? (
        <ErrorBox>{!role || !token ? "Missing role or token." : "That access link is not valid for this escrow."}</ErrorBox>
      ) : !escrow ? <ErrorBox>Escrow not found.</ErrorBox> : receipts.length === 0 ? (
        <Empty title="No receipts yet">This escrow is <b>{escrow.state}</b>. A receipt appears after the PayPal sandbox capture (funding), payout (release) or refund.</Empty>
      ) : (
        <div className="grid gap-3">
          {receipts.map((r) => (
            <Link key={r.id} href={`/receipt/${r.id}?role=${role}&token=${token}`} className="cs-card flex flex-wrap items-center justify-between gap-3 p-5 hover:border-[var(--accent)]">
              <div><div className="font-bold">{KIND_TITLE[r.kind]} <span className="font-mono text-sm text-mut">{r.number}</span></div><div className="text-xs text-mut">{formatLagos(r.issuedAt)}</div></div>
              <div className="flex items-center gap-3"><Badge tone="acc">{r.status}</Badge><span className="font-extrabold">{money(r.amount, r.currency)}</span></div>
            </Link>
          ))}
        </div>
      )}
    </Room>
  );
}

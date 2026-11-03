import Link from "next/link";
import { loadReceipt } from "@/lib/receipt-access";
import { ReceiptView } from "@/components/ReceiptView";
import { ReceiptActions } from "@/components/ReceiptActions";
import { Room, ErrorBox } from "@/components/room/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt · ClearSend", robots: { index: false } };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ role?: string; token?: string }> }) {
  const { id } = await params;
  const { role, token } = await searchParams;
  const res = await loadReceipt(id, { role, token });
  if (res.status !== 200) {
    return <Room><div className="mx-auto max-w-xl space-y-4">
      <ErrorBox>{res.status === 401 ? "This receipt is private. Open it from your ClearSend role link (payer, recipient or verifier), or from the private link the Telegram bot sent you." : res.status === 403 ? "That access link is not valid for this receipt." : "Receipt not found."}</ErrorBox>
      <Link className="underline text-sm" href="/receipts">How to find your receipts</Link>
    </div></Room>;
  }
  const r = res.receipt;
  const back = r.subjectType === "escrow" && role && token ? `/escrow/${r.subjectId}?role=${role}&token=${token}` : null;
  return (
    <Room>
      <div className="no-print mx-auto mb-6 flex max-w-2xl flex-wrap items-center justify-between gap-3">
        {back ? <Link href={back} className="text-sm font-semibold c-acc">← Back to escrow</Link> : <span />}
        <ReceiptActions />
      </div>
      <ReceiptView r={r} />
    </Room>
  );
}

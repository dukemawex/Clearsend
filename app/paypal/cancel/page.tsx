import { ButtonLink, Card, PageHeader, Room, SandboxNote } from "@/components/room/ui";

export default async function Cancel({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string }> }) {
  const { kind, id } = await searchParams;
  return (
    <Room>
      <PageHeader eyebrow="PayPal sandbox" title="Payment cancelled">You left PayPal before approving. Nothing was charged and no escrow or trip changed.</PageHeader>
      <Card className="max-w-xl space-y-4">
        {id && <p className="text-sm">Record: <code>{id}</code> ({kind})</p>}
        <div className="flex flex-wrap gap-2">
          {kind === "trip" ? <ButtonLink href="/plan">Back to Plan a trip</ButtonLink> : kind === "escrow" ? <ButtonLink href="/escrow">Back to escrows</ButtonLink> : <ButtonLink href="/agent">Back to the agent</ButtonLink>}
          <ButtonLink href="/" variant="ghost">Room</ButtonLink>
        </div>
        <SandboxNote />
      </Card>
    </Room>
  );
}

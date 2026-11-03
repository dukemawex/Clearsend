import { ButtonLink, Card, PageHeader, Room } from "@/components/room/ui";
import { SandboxHelp } from "@/components/SandboxHelp";

export default function Help() {
  return (
    <Room>
      <PageHeader eyebrow="PayPal sandbox" title="How to pay in the sandbox">ClearSend runs on PayPal&apos;s sandbox, so checkout needs test accounts or test cards. Nothing real is charged.</PageHeader>
      <Card className="max-w-2xl space-y-4">
        <SandboxHelp />
        <div className="text-sm space-y-2">
          <p className="font-semibold">Make your own sandbox buyer (2 minutes)</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Log in at <a className="underline" href="https://developer.paypal.com/dashboard/accounts" target="_blank" rel="noreferrer">developer.paypal.com/dashboard/accounts</a> with any real PayPal account (this only opens the developer dashboard).</li>
            <li>Under Sandbox accounts, click <b>Create account</b>, choose <b>Personal</b> (buyer), pick a country, create.</li>
            <li>Open the account&apos;s ⋮ menu → <b>View/Edit account</b> to see its generated email and password (you can set your own password).</li>
            <li>Use that email and password on the PayPal sandbox login page.</li>
          </ol>
        </div>
        <ButtonLink href="/escrow">Back to escrows</ButtonLink>
      </Card>
    </Room>
  );
}

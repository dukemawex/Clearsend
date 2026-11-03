import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listEscrows, type EscrowRecord } from "@/lib/escrow";

export const dynamic = "force-dynamic";

export default async function EscrowDashboardPage() {
  let escrows: EscrowRecord[];
  try {
    escrows = await listEscrows();
  } catch {
    escrows = [];
  }

  const getStateBadgeColor = (state: string) => {
    switch (state) {
      case "created": return "bg-gray-500";
      case "funded": return "bg-blue-500";
      case "submitted": return "bg-yellow-500";
      case "verified": return "bg-green-500";
      case "rejected": return "bg-red-500";
      case "released": return "bg-emerald-600";
      case "refunded": return "bg-orange-500";
      default: return "bg-gray-400";
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Escrow Dashboard</h1>
          <p className="text-gray-600">
            Secure payments with deliverable verification
          </p>
        </div>

        {escrows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-xl font-semibold mb-2">No escrows yet</h2>
            <p className="text-gray-600 mb-6">
              Create an escrow to securely hold funds until work is complete
            </p>
            <Link
              href="/agent"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Start with ClearSend Agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {escrows.map((escrow) => (
              <Link key={escrow.id} href={`/escrow/${escrow.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm text-gray-600">Escrow {escrow.id.slice(-8)}</p>
                        <p className="text-2xl font-bold mt-1">
                          {escrow.amount.toFixed(2)} {escrow.currency}
                        </p>
                      </div>
                      <Badge className={`${getStateBadgeColor(escrow.state)} text-white`}>
                        {escrow.state}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-gray-600">Payer</p>
                        <p className="font-medium">{escrow.payer}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Recipient</p>
                        <p className="font-medium">{escrow.recipient}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Specification</p>
                        <p className="text-gray-700 line-clamp-2">{escrow.specification}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-gray-500">
                        Created {new Date(escrow.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

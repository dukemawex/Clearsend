import type { Remittance } from "./journey-types";
import { Card } from "./ui/card";

export function RemittanceCard({ data }: { data: Remittance }) {
  return <Card className="data-card remittance-card"><div className="card-kicker">Cost clarity · {data.destination}</div><div className="money-line"><strong>${data.amountSent.toFixed(2)}</strong><span>sent</span></div><div className="breakdown"><div><span>ClearSend fee</span><strong>${data.fee.toFixed(2)}</strong></div><div><span>FX rate</span><strong>{data.fxRate.toFixed(4)}</strong></div><div className="received"><span>They receive</span><strong>{data.amountReceived.toFixed(2)} {data.currency}</strong></div></div></Card>;
}
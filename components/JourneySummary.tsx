import type { Flight, Remittance } from "./journey-types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function JourneySummary({ remittance, flight, status }: { remittance?: Remittance; flight?: Flight; status?: string }) {
  const total = remittance && flight ? remittance.amountSent + flight.price : undefined;
  return <Card className="summary"><div className="summary-top"><span className="card-kicker">Journey snapshot</span><Badge className="sandbox-pill">SANDBOX</Badge></div><h3>Your plan</h3>{remittance ? <div className="summary-row"><span className="summary-icon">↗</span><div><strong>Send to {remittance.destination}</strong><small>${remittance.amountSent.toFixed(2)} · {remittance.amountReceived.toFixed(2)} {remittance.currency} arrives</small></div></div> : <div className="summary-empty">Your remittance details will appear here.</div>}{flight ? <div className="summary-row"><span className="summary-icon">✈</span><div><strong>{flight.airline}</strong><small>{flight.route} · ${flight.price}</small></div></div> : <div className="summary-empty">Select a flight to add it to the journey.</div>}{total !== undefined && <div className="journey-total"><span>Total journey value</span><strong>${total.toFixed(2)} USD</strong></div>}{status && <div className="journey-status"><span className="status-dot" />{status}</div>}</Card>;
}
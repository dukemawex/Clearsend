export type Remittance = { amountSent: number; fee: number; fxRate: number; amountReceived: number; destination: string; currency: string };
export type Flight = { airline: string; route: string; depart: string; arrive: string; price: number };
export type Approval = { approvalId: string; toolName: string; toolCallId: string; input: Record<string, unknown> };
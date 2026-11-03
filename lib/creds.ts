"use client";
// Private role links the payer created on this device. Kept in localStorage only; never put in PayPal URLs.
type Cred = { id: string; role: string; url: string };
const KEY = "clearsend:escrow-links";
export function saveLinks(id: string, links: Record<string, string>) {
  const rest = loadLinks().filter((c) => c.id !== id);
  const add = Object.entries(links).map(([role, url]) => ({ id, role, url }));
  try { localStorage.setItem(KEY, JSON.stringify([...add, ...rest].slice(0, 60))); } catch {}
}
export function loadLinks(): Cred[] { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Cred[]; } catch { return []; } }
export function payerLink(id: string) { return loadLinks().find((c) => c.id === id && c.role === "payer")?.url ?? null; }

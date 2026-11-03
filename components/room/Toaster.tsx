"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; tone: "ok" | "bad" | "info"; title: string; body?: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.tone === "bad" ? 9000 : 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 60, width: "min(92vw,380px)", display: "grid", gap: 8, pointerEvents: "none" }}>
        {items.map((t) => (
          <div key={t.id} className="cs-rise" style={{ pointerEvents: "auto", background: "white", border: "1px solid #e2e8f0", borderLeft: `4px solid ${t.tone === "ok" ? "#0b815a" : t.tone === "bad" ? "#b42318" : "#0070ba"}`, borderRadius: 14, padding: 14, boxShadow: "0 12px 30px rgba(15,42,75,.15)", color: "#071633" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</div>
            {t.body && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{t.body}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

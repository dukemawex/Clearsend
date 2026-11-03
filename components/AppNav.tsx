"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClearSendLogo } from "./clearsend-logo";

const NAV = [
  { href: "/", label: "Room", icon: "🏠" },
  { href: "/agent", label: "Agent chat", icon: "💬" },
  { href: "/plan", label: "Plan a trip", icon: "✈️" },
  { href: "/send", label: "Send money", icon: "💸" },
  { href: "/trips", label: "Trips", icon: "🧳" },
  { href: "/escrow", label: "Escrow", icon: "🔒" },
  { href: "/activity", label: "Activity", icon: "📜" },
  { href: "/chat-bots", label: "Chat bots", icon: "🤖" },
  { href: "/judges", label: "Judges", icon: "📋" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => setTheme(document.documentElement.dataset.theme ?? "light"), []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cs-theme", next); } catch {}
    setTheme(next);
  };
  return <button type="button" className="theme-toggle" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode (Room pages)`} title="Optional dark mode for Room pages">{theme === "dark" ? "☀" : "☾"}</button>;
}

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const active = (h: string) => (h === "/" ? pathname === "/" : pathname?.startsWith(h));
  return (
    <>
      <nav className="app-nav" aria-label="Main">
        <div className="nav-brand">
          <Link href="/"><ClearSendLogo compact /><span>ClearSend</span></Link>
        </div>
        <div className="nav-links">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={`nav-link ${active(item.href) ? "active" : ""}`}>
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="nav-meta">
          <span className="live-dot" />
          <span className="nav-status">PayPal sandbox</span>
          <ThemeToggle />
          <button type="button" className="nav-toggle" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
        </div>
      </nav>
      <nav aria-label="Mobile" className={`mobile-nav ${open ? "open" : ""}`}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`nav-link ${active(item.href) ? "active" : ""}`}><span aria-hidden>{item.icon}</span> {item.label}</Link>
        ))}
      </nav>
    </>
  );
}

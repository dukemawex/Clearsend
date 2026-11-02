"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClearSendLogo } from "./clearsend-logo";

export function AppNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Chat", icon: "💬" },
    { href: "/send", label: "Send Money", icon: "💸" },
    { href: "/trips", label: "Flights & Trips", icon: "✈️" },
    { href: "/escrow", label: "Escrow", icon: "🔒" },
    { href: "/judges", label: "Judges", icon: "📋" },
  ];

  return (
    <nav className="app-nav">
      <div className="nav-brand">
        <Link href="/">
          <ClearSendLogo compact />
          <span className="brand-wordmark">ClearSend</span>
        </Link>
      </div>
      
      <div className="nav-links">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? "active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="nav-meta">
        <span className="live-dot" />
        <span className="nav-status">PayPal sandbox</span>
      </div>
    </nav>
  );
}

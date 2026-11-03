import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { Toaster } from "@/components/room/Toaster";
import "./globals.css";

export const metadata: Metadata = { title: "ClearSend", description: "Transparent cross-border money, travel and escrow with PayPal and an AI agent." };

// Light (white/blue) is the default. Dark mode is optional and only restyles Room pages.
const themeScript = `try{var t=localStorage.getItem("cs-theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><Toaster><AppNav />{children}</Toaster></body>
    </html>
  );
}

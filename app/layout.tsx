import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "ClearSend Journey", description: "Transparent remittances and flight payments." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
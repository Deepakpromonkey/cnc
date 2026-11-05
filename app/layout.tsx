import type { Metadata, Viewport } from "next";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Coffee & Creative", template: "%s · Coffee & Creative" },
  description: "CNC studio CRM — brands, tasks, approvals, invoices.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  const prefs = (u?.preferences ?? {}) as { theme?: "light" | "dark" };
  // Spec §11: light ("Crema") by default for clients, dark ("Espresso") for staff; per-user override.
  const theme = prefs.theme ?? (u?.role === "client" || !u ? "light" : "dark");
  return (
    <html lang="en-IN" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Manrope:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

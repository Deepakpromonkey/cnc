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
        <link rel="preload" href="/fonts/visby/VisbyCF-Regular.otf" as="font" type="font/otf" crossOrigin="" />
        <link rel="preload" href="/fonts/visby/VisbyCF-Bold.otf" as="font" type="font/otf" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}

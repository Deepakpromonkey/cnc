"use client";
import Script from "next/script";
import { useEffect } from "react";

// Spec §10.3: the Saarthi Staff assistant on the staff portals. Only Saarthi's address and the
// public staff key reach the browser; each sign-in gets a fresh token from the CRM's own
// /api/saarthi/staff-token, behind the CRM's login. The script reads its calls from a queue, so
// every call below works before and after it has loaded.

type Call = [method: string, ...args: unknown[]];
type StaffApi = { q: { push: (...calls: Call[]) => unknown }; logout?: () => unknown };
type StaffWindow = Window & { SaarthiStaff?: StaffApi };

let started = false; // one init per page load (React runs effects twice in development)
let failed = false; // the script couldn't load: callers fall back to the CRM's own Ask box

const pageTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

const push = (call: Call) => {
  const w = window as StaffWindow;
  (w.SaarthiStaff ??= { q: [] as Call[] }).q.push(call);
};

async function getStaffToken() {
  const r = await fetch("/api/saarthi/staff-token", { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) throw new Error(`No staff token (${r.status})`);
  const { token } = (await r.json()) as { token?: unknown };
  if (typeof token !== "string" || !token) throw new Error("No staff token");
  return token;
}

export function SaarthiStaff({ url, staffKey }: { url: string; staffKey: string }) {
  useEffect(() => {
    if (!started) {
      started = true;
      push(["init", { staffKey, getStaffToken, theme: pageTheme() }]);
    }
    // The CRM's own light/dark switch (ThemeButton) re-themes the panel at once.
    const sync = () => push(["setTheme", pageTheme()]);
    window.addEventListener("cnc-theme", sync);
    return () => window.removeEventListener("cnc-theme", sync);
  }, [staffKey]);
  return <Script src={`${url}/widget/staff-v1.js`} strategy="afterInteractive" onError={() => { failed = true; }} />;
}

const ready = () => typeof window !== "undefined" && started && !failed;

/** Opens the panel and asks `text`. False when the assistant isn't on this page or couldn't load. */
export function askSaarthiStaff(text: string): boolean {
  if (!ready()) return false;
  push(["ask", text]);
  return true;
}

/** Opens the panel. False when the assistant isn't on this page or couldn't load. */
export function openSaarthiStaff(): boolean {
  if (!ready()) return false;
  push(["open"]);
  return true;
}

/**
 * Signs the person out of the assistant in every tab of this browser. Call it from the CRM's own
 * sign-out without waiting for it; safe on pages where the assistant isn't (or isn't yet) loaded.
 */
export function logoutSaarthiStaff(): void {
  try {
    const s = (window as StaffWindow).SaarthiStaff;
    if (!s) return;
    if (typeof s.logout === "function") void Promise.resolve(s.logout()).catch(() => {});
    else s.q.push(["logout"]); // still loading: it runs if the script arrives before the page goes
  } catch { /* never in the way of signing out */ }
}

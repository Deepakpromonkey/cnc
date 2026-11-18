"use client";
// ⌘K / Ctrl+K quick jump: type a task, brand, person, invoice or request and land on it, or jump to a tab.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { quickSearch, type JumpHit } from "@/app/actions/common";
import type { NavItem } from "./shell";

const KIND_LABEL: Record<JumpHit["kind"], string> = { task: "Task", brand: "Brand", person: "Person", invoice: "Invoice", request: "Request", project: "Project" };

type Row = { key: string; title: string; sub: string; url: string; tag: string };

export function Palette({ nav }: { nav: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<JumpHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // Open with ⌘K / Ctrl+K from anywhere; Esc closes.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { if (open) { setQ(""); setHits([]); setSel(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  // Debounced server search.
  useEffect(() => {
    if (!open) return;
    const s = q.trim();
    if (s.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await quickSearch(s);
      if (id !== seq.current) return;
      setHits(r.ok ? r.hits : []); setBusy(false); setSel(0);
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const s = q.trim().toLowerCase();
  const navRows: Row[] = nav.filter((n) => !s || n.label.toLowerCase().includes(s)).map((n) => ({ key: "nav:" + n.href, title: n.label, sub: "Go to tab", url: n.href, tag: "Tab" }));
  const rows: Row[] = [...hits.map((h) => ({ key: h.kind + ":" + h.id, title: h.title, sub: h.sub, url: h.url, tag: KIND_LABEL[h.kind] })), ...(s.length >= 2 ? navRows.slice(0, 3) : navRows)];
  const go = (r: Row) => { setOpen(false); router.push(r.url); router.refresh(); };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="pal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="pal" role="dialog" aria-label="Quick jump">
        <div className="pal-in">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={input} value={q} placeholder="Jump to a task, brand, person, invoice, request… or a tab" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(rows.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter" && rows[sel]) { e.preventDefault(); go(rows[sel]); }
            }} />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list">
          {rows.length ? rows.map((r, i) => (
            <button key={r.key} type="button" className={`pal-row${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <span className="tag">{r.tag}</span><span className="pal-t">{r.title}<small>{r.sub}</small></span><span className="pal-go">↵</span>
            </button>
          )) : <div className="empty" style={{ margin: 8 }}>{busy ? "Searching…" : s.length >= 2 ? "Nothing matches." : "Type to search. Try a task name, “T-1211”, a brand, or “INV-1044”."}</div>}
        </div>
        <div className="pal-foot"><span>↑↓ move · ↵ open · esc close</span><span>⌘K / Ctrl+K from any page</span></div>
      </div>
    </div>, document.body);
}

/** Small top-bar button that opens the palette (for mouse users). */
export function PaletteButton() {
  return (
    <button className="tbtn" title="Quick jump · ⌘K" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}>
      <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7" /></svg>
    </button>
  );
}

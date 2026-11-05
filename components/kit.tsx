"use client";
// Interactive primitives: drawer, toast, chips, switches, uploaders, action forms.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/lib/result";
import { SearchIcon, Stars } from "./ui";

// ---------- drawer + toast ----------
type Ctx = { open: (node: ReactNode, key?: string) => void; close: () => void; toast: (msg: string) => void; openKey: string | null };
const UiCtx = createContext<Ctx>({ open: () => {}, close: () => {}, toast: () => {}, openKey: null });
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  const [on, setOn] = useState(false);
  const [openKey, setKey] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drawerRef = useRef<HTMLElement>(null);

  const open = useCallback((n: ReactNode, key?: string) => {
    setNode(n); setOn(true);
    setKey((prev) => { if (prev !== (key ?? null)) requestAnimationFrame(() => drawerRef.current?.scrollTo({ top: 0 })); return key ?? null; });
  }, []);
  const close = useCallback(() => { setOn(false); setKey(null); }, []);
  const toast = useCallback((m: string) => {
    setMsg(m); setToastOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastOn(false), 2600);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setOn(false); setKey(null); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);

  // Stable value: opening the drawer or a toast mustn't re-render every useUi() consumer.
  const value = useMemo(() => ({ open, close, toast, openKey }), [open, close, toast, openKey]);

  return (
    <UiCtx.Provider value={value}>
      {children}
      <div className={`scrim${on ? " on" : ""}`} onClick={close} />
      <aside className={`drawer${on ? " on" : ""}`} ref={drawerRef} aria-hidden={!on}>
        <button className="x" onClick={close} aria-label="Close">×</button>
        <div id="drawerBody">{on || node ? node : null}</div>
      </aside>
      <div id="toast" className={toastOn ? "on" : ""} role="status">{msg}</div>
    </UiCtx.Provider>
  );
}

/**
 * Opens a drawer for one item of a server-fed list and keeps it in sync: when the list
 * refreshes after an action, the open drawer re-renders with the fresh item.
 */
export function useLiveDrawer<T extends { id: string }>(list: T[], render: (x: T) => ReactNode, prefix: string, initialId?: string | null) {
  const { open, openKey } = useUi();
  const renderRef = useRef(render);
  renderRef.current = render;
  // The item object currently shown. Callers may rebuild `list` on every render (e.g. a
  // flatMap), so re-render the drawer only when the item itself is new — i.e. after a refresh.
  const shown = useRef<T | null>(null);
  useEffect(() => {
    if (!openKey?.startsWith(prefix + ":")) return;
    const x = list.find((i) => `${prefix}:${i.id}` === openKey);
    if (x && x !== shown.current) { shown.current = x; open(renderRef.current(x), openKey); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  useEffect(() => {
    const x = initialId ? list.find((i) => i.id === initialId) : null;
    if (x) { shown.current = x; open(renderRef.current(x), `${prefix}:${x.id}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);
  return (x: T) => { shown.current = x; open(render(x), `${prefix}:${x.id}`); };
}

// ---------- action form ----------
/**
 * Runs a server action with the form's data; toasts the result, closes the drawer and
 * refreshes server data on success.
 */
export function ActionForm({
  action, children, keepOpen, onDone, className = "form", confirm, resetOnSuccess,
}: {
  action: (fd: FormData) => Promise<Result>; children: ReactNode; keepOpen?: boolean;
  onDone?: (r: Result) => void; className?: string; confirm?: string; resetOnSuccess?: boolean;
}) {
  const { toast, close } = useUi();
  const router = useRouter();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) fd.set(submitter.name, submitter.value);
        start(async () => {
          const r = await action(fd);
          if (!r.ok) { toast(r.error); return; }
          if (r.message) toast(r.message);
          if (resetOnSuccess) ref.current?.reset();
          if (!keepOpen) close();
          onDone?.(r);
          if (r.url) window.location.href = r.url;
          else router.refresh();
        });
      }}
    >
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, display: "contents" }}>{children}</fieldset>
    </form>
  );
}

/** A single button that fires an action with fixed values (no form fields). */
export function ActionButton({
  action, values = {}, children, className = "btn", confirm, keepOpen = true, style, disabled, title,
}: {
  action: (fd: FormData) => Promise<Result>; values?: Record<string, string>; children: ReactNode;
  className?: string; confirm?: string; keepOpen?: boolean; style?: React.CSSProperties; disabled?: boolean; title?: string;
}) {
  const { toast, close } = useUi();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button" className={className} style={style} disabled={disabled || pending} title={title}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData();
        Object.entries(values).forEach(([k, v]) => fd.set(k, v));
        start(async () => {
          const r = await action(fd);
          if (!r.ok) { toast(r.error); return; }
          if (r.message) toast(r.message);
          if (!keepOpen) close();
          if (r.url) window.location.href = r.url;
          else router.refresh();
        });
      }}
    >
      {children}
    </button>
  );
}

// ---------- chips / search ----------
export function Chips({ items, value, onChange }: { items: ([string, number | null | undefined] | [string, number | null | undefined, string])[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="chips">
      {items.map(([k, c, label]) => (
        <button type="button" key={k} className={`chip${value === k ? " on" : ""}`} onClick={() => onChange(k)}>
          {label ?? k}{c != null ? <span className="c">{c}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <SearchIcon />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

// ---------- form bits ----------
export function Switch({ name, label, sub, defaultOn = false, onToggle }: { name?: string; label: string; sub?: string; defaultOn?: boolean; onToggle?: (on: boolean) => void }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <label className={`sw${on ? " on" : ""}`} onClick={(e) => { e.preventDefault(); setOn(!on); onToggle?.(!on); }}>
      {name ? <input type="hidden" name={name} value={on ? "on" : ""} /> : null}
      <i />
      <div><span>{label}</span>{sub ? <small>{sub}</small> : null}</div>
    </label>
  );
}

export function F({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field">{label}{children}</div>;
}

export function Sec({ children }: { children: ReactNode }) {
  return <div className="eyebrow" style={{ marginTop: 6 }}>{children}</div>;
}

export function Sel({ name, options, value, multiple, required, placeholder }: {
  name: string; options: (string | [string, string])[]; value?: string | string[] | null; multiple?: boolean; required?: boolean; placeholder?: string;
}) {
  return (
    <select name={name} defaultValue={value ?? (multiple ? [] : "")} multiple={multiple} size={multiple ? 5 : undefined} required={required}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => {
        const [v, l] = typeof o === "string" ? [o, o] : o;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

/** Single image (logo / photo) with live preview. */
export function UploadOne({ name, label, hint, round, existing }: { name: string; label: string; hint: string; round?: boolean; existing?: string | null }) {
  const [src, setSrc] = useState<string | null>(existing ?? null);
  const [fname, setFname] = useState<string | null>(null);
  return (
    <div className="field">
      {label}
      <label className="drop">
        <span className={`pv${round ? " round" : ""}`}>{src ? <img src={src} alt="" /> : "IMG"}</span>
        <span><b>{src ? "Change image" : "Upload image"}</b><small>{fname ?? hint}</small></span>
        <input type="file" name={name} accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFname(f.name); setSrc(URL.createObjectURL(f)); } }} />
      </label>
    </div>
  );
}

/** Many images + optional heavy-file link (spec §6.9). */
export function UploadMany({ name, label, hint, linkName }: { name: string; label?: string; hint: string; linkName?: string }) {
  const [files, setFiles] = useState<{ n: string; u: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const add = (list: FileList | null) => {
    if (!list || !inputRef.current) return;
    const dt = new DataTransfer();
    Array.from(inputRef.current.files ?? []).forEach((f) => dt.items.add(f));
    Array.from(list).forEach((f) => dt.items.add(f));
    inputRef.current.files = dt.files;
    setFiles(Array.from(dt.files).map((f) => ({ n: f.name, u: URL.createObjectURL(f) })));
  };
  return (
    <div className="field">
      {label}
      <div className="up">
        <label className={`drop${drag ? " drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
          <span className="pv">+</span>
          <span><b>{files.length ? "Add more" : "Upload images"}</b><small>{hint}</small></span>
          <input ref={inputRef} type="file" name={name} multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
            onChange={(e) => { const fl = e.target.files; if (fl) setFiles(Array.from(fl).map((f) => ({ n: f.name, u: URL.createObjectURL(f) }))); }} />
        </label>
        {files.length ? (
          <div className="thumbs">{files.map((f) => <div className="th" key={f.u}><img src={f.u} alt="" /><span>{f.n}</span></div>)}</div>
        ) : null}
        {linkName ? (
          <div className="orlink">
            <span>Heavy files?</span>
            <input type="text" name={linkName} placeholder="Paste a Google Drive / Frame.io link for videos, PSDs, raw shoots"
              style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--line-strong)", borderRadius: 12, color: "var(--fg)", font: "inherit", padding: "9px 12px" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Comment box with @mention autocomplete: type "@" and a name, pick from the list.
 * The server resolves "@First" to the user, so inserting the first name is enough.
 */
export function MentionInput({ name = "body", placeholder, people }: { name?: string; placeholder: string; people: { id: string; name: string }[] }) {
  const [v, setV] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const m = /@([A-Za-z]*)$/.exec(v.slice(0, ref.current?.selectionStart ?? v.length));
  const opts = m ? people.filter((p) => p.name.toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 6) : [];
  const pick = (p: { name: string }) => {
    const pos = ref.current?.selectionStart ?? v.length;
    const before = v.slice(0, pos).replace(/@[A-Za-z]*$/, `@${p.name.split(" ")[0]} `);
    setV(before + v.slice(pos)); setSel(0);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(before.length, before.length); });
  };
  return (
    <span className="mention">
      <input ref={ref} name={name} value={v} placeholder={placeholder} autoComplete="off" onChange={(e) => { setV(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (!opts.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => (i + 1) % opts.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => (i - 1 + opts.length) % opts.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(opts[sel]); }
        }} />
      {opts.length ? <div className="mention-pop">{opts.map((p, i) => <button type="button" key={p.id} className={i === sel ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>@{p.name}</button>)}</div> : null}
    </span>
  );
}

/** Copies a prepared text (e.g. the morning summary) to the clipboard and toasts. */
export function CopyText({ text, children, className = "btn" }: { text: string; children: ReactNode; className?: string }) {
  const { toast } = useUi();
  return (
    <button type="button" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(text); toast("Copied — paste it into WhatsApp or mail"); }
      catch { toast("Couldn't copy on this browser"); }
    }}>{children}</button>
  );
}

export function StarInput({ name, initial = 0 }: { name: string; initial?: number }) {
  const [n, setN] = useState(initial);
  return (
    <span className="star-input">
      <input type="hidden" name={name} value={n || ""} />
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} onClick={() => setN(i)} style={{ color: i <= n ? "var(--gold)" : "var(--faint)" }}>★</span>
      ))}
    </span>
  );
}

export { Stars };

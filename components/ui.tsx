// Presentational pieces shared by every portal. No hooks, so usable from server and client.
import type { ReactNode } from "react";

export const ini = (n: string) =>
  n.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function Pill({ cls = "", children }: { cls?: string; children: ReactNode }) {
  return <span className={`st ${cls}`}>{children}</span>;
}

export function Who({ n, sub }: { n: string; sub?: string }) {
  return (
    <span className="who">
      <i>{ini(n)}</i>
      {n}
      {sub ? <small style={{ color: "var(--muted)" }}> · {sub}</small> : null}
    </span>
  );
}

export function Stars({ n, size }: { n: number; size?: number }) {
  return (
    <span style={size ? { fontSize: size } : undefined}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? "var(--gold)" : "var(--faint)" }}>★</span>
      ))}
    </span>
  );
}

export function Field({ label, value, wide, children }: { label: string; value?: ReactNode; wide?: boolean; children?: ReactNode }) {
  const v = children ?? value;
  return (
    <div className={`pf${wide ? " wide" : ""}`}>
      <span>{label}</span>
      <b>{v === null || v === undefined || v === "" ? <i style={{ color: "var(--faint)", fontStyle: "normal" }}>—</i> : v}</b>
    </div>
  );
}

export type Stat = [ReactNode, string, ("hot" | "gold" | "")?];

export function Stats({ items, cols }: { items: Stat[]; cols?: number }) {
  return (
    <div className="stats" style={cols ? { gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 8 } : undefined}>
      {items.map(([v, l, c], i) => (
        <div className="stat" key={i} style={cols ? { padding: "10px 12px" } : undefined}>
          <b className={`num ${c ?? ""}`} style={cols ? { fontSize: 24 } : undefined}>{v}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

export function Ring({ v }: { v: number }) {
  return (
    <div className={`ring${v < 80 ? " low" : ""}`}>
      <svg viewBox="0 0 56 56">
        <circle className="track" cx="28" cy="28" r="25" />
        <circle className="bar" cx="28" cy="28" r="25" style={{ strokeDashoffset: 157 - (157 * v) / 100 }} />
      </svg>
      <b>{v}</b>
    </div>
  );
}

export function Mini({ v }: { v: number }) {
  return <span className="mini"><i style={{ width: `${v}%` }} /></span>;
}

export function Empty({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div className="empty" style={style}>{children}</div>;
}

export function Ext({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a className="lnk" href={href} target="_blank" rel="noopener noreferrer">
      🔗 {children ?? href.replace(/^https?:\/\//, "").slice(0, 48)}
    </a>
  );
}

export function LinkOrDash({ href }: { href?: string | null }) {
  return href ? <Ext href={href} /> : <i style={{ color: "var(--faint)", fontStyle: "normal" }}>—</i>;
}

export function Tags({ items }: { items: string[] }) {
  return <div className="tags" style={{ marginTop: 4 }}>{items.map((s) => <span className="tag" key={s}>{s}</span>)}</div>;
}

export function Flag({ c, style }: { c: string; style?: React.CSSProperties }) {
  return <i className={`flag ${c}`} style={style} />;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ph">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export const PlusIcon = () => <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>;
export const PenIcon = () => <svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4" /></svg>;
export const SearchIcon = () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;

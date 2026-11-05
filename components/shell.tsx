"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UiProvider, useUi } from "./kit";
import { ini } from "./ui";
import { Palette, PaletteButton } from "./palette";
import { askSarthi, markAllRead, openNotification, savePrefs, signOut, stopImpersonating, uploadBackdrop } from "@/app/actions/common";
import { pendingForLogout, saveLogoutReasons, type PendingTask } from "@/app/actions/team";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number; hot?: boolean };
export type Notif = { id: string; title: string; module: string; when: string; read: boolean };
export type Prefs = { backdrop?: string; bdImage?: string | null; veil?: number; blur?: number };

export const ICONS = {
  today: <path d="M3 12 12 4l9 8M5 10v10h14V10" />,
  brands: <path d="M4 7h16v13H4zM8 7V4h8v3" />,
  tasks: <path d="M9 11l3 3 8-8M4 20h16M4 4h8" />,
  approvals: <path d="M9 11l3 3 8-8M4 20h16" />,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3" /></>,
  people: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0M19 8h3M20.5 6.5v3" /></>,
  concerns: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01" />,
  announce: <path d="M4 10v4h3l6 4V6l-6 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />,
  requests: <path d="M4 5h16v11H9l-5 4z" />,
  money: <path d="M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" />,
  attendance: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  sarthi: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>,
  profile: <path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 20a8 8 0 0 1 16 0" />,
  eod: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  score: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  review: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
  digest: <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zM8 10h8M8 14h5" />,
  flags: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
};

const PRESETS: Record<string, string> = {
  glow: "var(--glow)",
  plain: "none",
  rings: "radial-gradient(circle at 18% 30%, transparent 240px, var(--brand-soft) 242px, var(--brand-soft) 262px, transparent 264px), radial-gradient(circle at 82% 75%, transparent 160px, var(--gold-soft) 162px, var(--gold-soft) 176px, transparent 178px), radial-gradient(circle at 60% 10%, transparent 90px, var(--brand-soft) 92px, var(--brand-soft) 100px, transparent 102px)",
  linen: "repeating-linear-gradient(45deg, var(--gold-soft) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, var(--brand-soft) 0 1px, transparent 1px 11px)",
  marble: "conic-gradient(from 210deg at 70% 20%, var(--brand-soft), var(--gold-soft), transparent 40%, var(--brand-soft) 70%, var(--gold-soft)), radial-gradient(900px 500px at 10% 100%, var(--gold-soft), transparent 70%)",
  beans: "radial-gradient(ellipse 260px 420px at 12% 20%, var(--brand-soft), transparent 70%), radial-gradient(ellipse 220px 360px at 88% 85%, var(--brand-soft), transparent 70%), radial-gradient(ellipse 160px 260px at 55% 55%, var(--gold-soft), transparent 70%)",
};
const SWATCH: Record<string, string> = {
  glow: "radial-gradient(circle at 80% 10%,rgba(160,32,42,.6),transparent 60%),radial-gradient(circle at 10% 90%,rgba(201,160,99,.5),transparent 60%)",
  plain: "",
  rings: "radial-gradient(circle at 30% 40%,transparent 28%,rgba(160,32,42,.5) 30%,rgba(160,32,42,.5) 34%,transparent 36%),radial-gradient(circle at 75% 70%,transparent 20%,rgba(201,160,99,.5) 22%,rgba(201,160,99,.5) 25%,transparent 27%)",
  linen: "repeating-linear-gradient(45deg,rgba(201,160,99,.25) 0 2px,transparent 2px 6px)",
  marble: "conic-gradient(from 200deg at 60% 40%,rgba(160,32,42,.45),rgba(201,160,99,.35),rgba(160,32,42,.2),rgba(201,160,99,.45))",
  beans: "radial-gradient(ellipse 40% 60% at 30% 35%,rgba(160,32,42,.55),transparent 60%),radial-gradient(ellipse 40% 60% at 72% 70%,rgba(160,32,42,.55),transparent 60%)",
};

function istNow() {
  const d = new Date();
  return new Date(d.getTime() + (d.getTimezoneOffset() + 330) * 60000);
}

function Clock({ place }: { place?: string }) {
  const [t, setT] = useState<{ day: string; time: string } | null>(null);
  useEffect(() => {
    const tick = () => {
      const ist = istNow();
      const h = ist.getHours(), m = ist.getMinutes();
      setT({
        day: ist.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        time: `${h % 12 || 12}:${m < 10 ? "0" : ""}${m} ${h < 12 ? "am" : "pm"}`,
      });
    };
    tick();
    const i = setInterval(tick, 30000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="clock">
      <b suppressHydrationWarning>{t?.day ?? " "}</b>
      <span><span suppressHydrationWarning>{t?.time ?? ""}</span> IST{place ? ` · ${place}` : ""}</span>
    </div>
  );
}

function AskBox({ placeholder }: { placeholder: string }) {
  const { open, toast } = useUi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="ask" onSubmit={(e) => {
      e.preventDefault();
      const question = q.trim();
      if (!question || pending) return;
      start(async () => {
        const r = await askSarthi(question);
        if (!r.ok) { toast(r.error); return; }
        setQ("");
        open(
          <>
            <div className="eyebrow">Sarthi</div>
            <h2>Your <em style={{ color: "var(--brand-ink)" }}>barista</em> answers.</h2>
            <div className="chat">
              <div className="bubble q"><small>You · just now</small>{question}</div>
              <div className="bubble a"><small>Sarthi{r.source === "local" ? " · read from the CRM" : ""}</small>{r.answer}</div>
            </div>
          </>,
        );
        router.refresh();
      });
    }}>
      <svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <button type="submit" disabled={pending}>{pending ? "…" : "Ask"}</button>
    </form>
  );
}

function Bell({ items, base }: { items: Notif[]; base: string }) {
  const [openPop, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;
  useEffect(() => {
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", c);
    return () => document.removeEventListener("click", c);
  }, []);
  return (
    <div className="nwrap" ref={ref}>
      <button className="tbtn" title="Notifications" onClick={() => setOpen(!openPop)}>
        <svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" /></svg>
      </button>
      {unread ? <span className="nbadge">{unread}</span> : null}
      {openPop ? (
        <div className="npop">
          <div className="card-h"><div className="eyebrow">Notifications</div>
            <button className="linkbtn" onClick={async () => { await markAllRead(); router.refresh(); }}>Mark all read</button></div>
          {items.length ? items.map((n) => (
            <button key={n.id} className={`nitem${n.read ? "" : " un"}`} onClick={async () => {
              setOpen(false);
              const r = await openNotification(n.id);
              router.push(r.ok && r.url ? r.url : base);
              router.refresh();
            }}>
              <span className="tag">{n.module}</span><b>{n.title}</b><small>{n.when}</small>
            </button>
          )) : <div className="empty">All quiet.</div>}
        </div>
      ) : null}
    </div>
  );
}

function ThemeButton({ className, children }: { className: string; children: ReactNode }) {
  return (
    <button className={className} title="Light / dark" onClick={() => {
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("cnc-theme", next); } catch {}
      savePrefs({ theme: next });
      window.dispatchEvent(new Event("cnc-theme"));
    }}>{children}</button>
  );
}

function Backdrop({ prefs }: { prefs: Prefs }) {
  const [p, setP] = useState<Prefs>(prefs);
  const [openPop, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMounted(true);
    const sync = () => setDark(document.documentElement.getAttribute("data-theme") === "dark");
    sync();
    window.addEventListener("cnc-theme", sync);
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", c);
    return () => { window.removeEventListener("cnc-theme", sync); document.removeEventListener("click", c); };
  }, []);
  const veil = (p.veil ?? 82) / 100;
  const style: React.CSSProperties & Record<string, string> = p.bdImage
    ? { "--bd-img": `url("${p.bdImage}")`, "--bd-blur": `${p.blur ?? 0}px`, "--veil": dark ? `rgba(18,13,14,${veil})` : `rgba(244,236,225,${veil})` }
    : { backgroundImage: PRESETS[p.backdrop ?? "glow"] ?? PRESETS.glow };
  const update = (n: Prefs) => { setP(n); savePrefs({ backdrop: n.backdrop, veil: n.veil, blur: n.blur, clearImage: !n.bdImage }); };
  return (
    <>
      {/* Lives on <body>, outside .shell's stacking context, like the mockup. */}
      {mounted ? createPortal(<div id="backdrop" className={p.bdImage ? "img" : ""} style={style} />, document.body) : null}
      <div className="bdwrap" ref={ref}>
        <button className="tbtn" title="Backdrop" onClick={() => setOpen(!openPop)}>
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.6" /></svg>
        </button>
        {openPop ? (
          <div className="bdpop">
            <div className="eyebrow">Backdrop</div>
            <div className="swatches">
              {Object.keys(PRESETS).map((k) => (
                <button key={k} className={!p.bdImage && (p.backdrop ?? "glow") === k ? "on" : ""} onClick={() => update({ ...p, backdrop: k, bdImage: null })}>
                  <i style={{ background: SWATCH[k] || undefined }} />{k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <label className="upl">
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.set("file", f);
                const r = await uploadBackdrop(fd);
                if (r.ok && r.url) setP({ ...p, bdImage: r.url });
              }} />
              <span>Upload your own image</span><small>Photo, artwork, a campaign shot. Saved to your profile.</small>
            </label>
            {p.bdImage ? (
              <>
                <div className="rng">
                  <span>Veil</span><input type="range" min={30} max={95} value={p.veil ?? 82} onChange={(e) => setP({ ...p, veil: +e.target.value })} onMouseUp={() => update(p)} onTouchEnd={() => update(p)} />
                  <span>Blur</span><input type="range" min={0} max={20} value={p.blur ?? 0} onChange={(e) => setP({ ...p, blur: +e.target.value })} onMouseUp={() => update(p)} onTouchEnd={() => update(p)} />
                </div>
                <button className="clr" onClick={() => update({ ...p, bdImage: null, backdrop: "glow" })}>Remove image</button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Sign out. Staff with unfinished tasks on their desk must say why for each one first; the
 * reasons become today's EOD lines and a note on each task.
 */
function SignOut({ checkTasks }: { checkTasks: boolean }) {
  const [pending, setPending] = useState<PendingTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const leave = async () => { await signOut(); window.location.href = "/login"; };
  return (
    <>
      <button className="linkbtn" style={{ fontSize: 11 }} disabled={busy} onClick={async () => {
        if (!checkTasks) return leave();
        setBusy(true);
        const list = await pendingForLogout().catch(() => []);
        setBusy(false);
        if (!list.length) return leave();
        setErr(""); setPending(list);
      }}>{busy ? "Checking…" : "Sign out"}</button>
      {pending ? createPortal(
        <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <form className="modal" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setErr("");
            const r = await saveLogoutReasons(new FormData(e.currentTarget));
            if (!r.ok) { setErr(r.error); setBusy(false); return; }
            await leave();
          }}>
            <div>
              <div className="eyebrow">Before you go</div>
              <h2 id="logout-title">{pending.length === 1 ? "One task" : `${pending.length} tasks`} still on your <em>desk.</em></h2>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>Tell us why each one isn&apos;t done yet. Your CS sees this as today&apos;s EOD line and on the task.</p>
            </div>
            {pending.map((t) => (
              <label key={t.id} className="field" style={{ gap: 6 }}>
                <input type="hidden" name="taskId" value={t.id} />
                <span style={{ color: "var(--fg)", fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                <span style={{ fontSize: 12 }}>{t.brand} · {t.status} · due {t.due}{t.late ? <b style={{ color: "var(--brand-ink)" }}> · {t.late}</b> : t.dueToday ? <b style={{ color: "var(--gold)" }}> · due today</b> : null}</span>
                <textarea name={`reason_${t.id}`} defaultValue={t.reason} required rows={2} placeholder="Why isn't it done yet? e.g. waiting on copy from the client, 2 of 4 creatives done" />
              </label>
            ))}
            {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : null}
            <div className="actions">
              <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save reasons & sign out"}</button>
              <button className="btn" type="button" disabled={busy} onClick={() => setPending(null)}>Stay signed in</button>
            </div>
          </form>
        </div>, document.body) : null}
    </>
  );
}

export function Shell({
  portal, tagline, nav, me, notifs, prefs, ask, place, impersonating, children,
}: {
  portal: "admin" | "client" | "team"; tagline: string; nav: NavItem[]; me: { name: string; sub: string };
  notifs: Notif[]; prefs: Prefs; ask?: string; place?: string; impersonating?: boolean; children: ReactNode;
}) {
  const path = usePathname();
  const base = `/${portal}`;
  const active = (href: string) => (href === base ? path === base : path.startsWith(href));
  return (
    <UiProvider>
      <Palette nav={nav} />
      <div className="shell">
        <aside className="side">
          <div className="logo">
            <img className="red" src="/brand/logo-red.webp" alt="Coffee & Creative" />
            <img className="cream" src="/brand/logo-cream.webp" alt="Coffee & Creative" />
            <small>{tagline}</small>
          </div>
          <nav>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""}>
                <svg viewBox="0 0 24 24">{ICONS[n.icon]}</svg>{n.label}
                {n.count ? <span className={`pill${n.hot ? " hot" : ""}`}>{n.count}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="foot">
            <div className="sarthi-chip"><span className="dot" /><div><b>Sarthi is awake</b><span>{portal === "admin" ? "Reading the brew · WhatsApp live" : "WhatsApp live"}</span></div></div>
            <ThemeButton className="theme-toggle"><i /> Crema / Espresso</ThemeButton>
          </div>
        </aside>
        <main>
          {impersonating ? (
            <div className="imp-bar">Viewing as {me.name} · admin impersonation (audited)
              <button onClick={async () => { const r = await stopImpersonating(); window.location.href = r.ok && r.url ? r.url : "/admin"; }}>Back to admin</button></div>
          ) : null}
          <div className="top">
            <Clock place={place} />
            {ask ? <AskBox placeholder={ask} /> : <div style={{ flex: "1 1 200px" }} />}
            <div className="tools">
              <PaletteButton />
              <Bell items={notifs} base={base} />
              <ThemeButton className="tbtn">
                <svg viewBox="0 0 24 24" className="sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                <svg viewBox="0 0 24 24" className="moon"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
              </ThemeButton>
              <Backdrop prefs={prefs} />
            </div>
            <div className="me">
              <div className="avatar">{ini(me.name)}</div>
              <div><b>{me.name}</b>{me.sub}<br />
                <SignOut checkTasks={portal === "team"} /></div>
            </div>
          </div>
          {children}
          <footer><span>Coffee & Creative · lets brew thoughts</span><span>Built by ProMonkey · Sarthi-ready</span></footer>
        </main>
      </div>
    </UiProvider>
  );
}

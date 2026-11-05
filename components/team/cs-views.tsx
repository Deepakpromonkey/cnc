"use client";
// Client-servicing views of the Team portal (spec §8: My brands, Review queue, Client digest, Flags).
import { useState } from "react";
import { ActionButton, ActionForm, Chips, F, Search, StarInput, useLiveDrawer, useUi } from "../kit";
import { Ext, Field, Flag, Mini, PageHead, Pill, PlusIcon, Ring, Stats, Tags, Who, ini, LinkOrDash } from "../ui";
import { FlagForm, ProjectForm, TaskForm } from "../admin/forms";
import { TaskDrawer } from "../admin/task-drawer";
import { saveBrand } from "@/app/actions/people";
import { reviewTask, setDigest } from "@/app/actions/team";
import type { TaskVM } from "@/lib/views";
import type { CsBrandVM } from "@/lib/team-views";

const em = (s: string) => <em style={{ color: "var(--brand-ink)" }}>{s}</em>;
const TA: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 12, color: "var(--fg)", font: "inherit", padding: "10px 12px", minHeight: 60 };

// ---------------- My brands ----------------
function ContactForm({ b }: { b: CsBrandVM }) {
  const { close } = useUi();
  const p = b.profile;
  return (
    <ActionForm action={saveBrand} className="dform">
      <div className="eyebrow">Brand contacts</div><h2>{b.name}</h2>
      <input type="hidden" name="id" value={b.id} /><input type="hidden" name="name" value={b.name} />
      <div className="form">
        <div className="two"><F label="POC name"><input name="pocName" defaultValue={p.pocName ?? ""} /></F><F label="POC phone"><input name="pocPhone" defaultValue={p.pocPhone ?? ""} /></F></div>
        <div className="two"><F label="Official email"><input name="officialEmail" defaultValue={p.officialEmail ?? ""} /></F><F label="WhatsApp"><input name="whatsapp" defaultValue={p.whatsapp ?? ""} /></F></div>
        <p className="muted small" style={{ margin: 0 }}>CS can update contact fields. Company, tax, scope and engagement are edited by admin.</p>
      </div>
      <div className="actions"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={close}>Cancel</button></div>
    </ActionForm>
  );
}

export function CsBrandsView({ brands, tasks }: { brands: CsBrandVM[]; tasks: TaskVM[] }) {
  const { open } = useUi();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const openTask = useLiveDrawer(tasks, (t) => <TaskDrawer t={t} flag />, "task");
  const rows = brands.filter((b) => !q || `${b.name} ${b.company}`.toLowerCase().includes(q.toLowerCase()));
  const b = brands.find((x) => x.id === sel) ?? rows[0];
  const bt = tasks.filter((t) => t.brandId === b?.id && !t.status.isDone);
  const p = b?.profile ?? {};
  return (
    <section className="view on">
      <PageHead eyebrow="My brands" title={<>The cups you&apos;re {em("holding.")}</>} sub="Every brand you look after: who to call, what's open, what's waiting on them, and where the money is." />
      <Stats items={[[brands.length, "Brands"], [brands.reduce((s, x) => s + x.open, 0), "Open tasks"], [brands.reduce((s, x) => s + x.late, 0), "Late", "hot"], [brands.reduce((s, x) => s + x.waiting, 0), "Awaiting client"], [brands.filter((x) => x.health < 80).length, "Cooling", "hot"]]} />
      <div className="bar"><Search value={q} onChange={setQ} placeholder="Search brand" /></div>
      <div className="split">
        <div className="scroll"><table className="tbl"><thead><tr><th>Brand</th><th>POC</th><th className="r">Open</th><th className="r">Late</th><th className="r">Awaiting</th><th>Health</th><th>Invoice</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id} className={x.id === b?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
              <td className="n"><span className="bar" style={{ gap: 10, flexWrap: "nowrap" }}><span className="blogo">{x.logo ? <img src={x.logo} alt="" /> : ini(x.name)}</span><span>{x.name}<small>{x.primary ? "you're primary CS" : "co-CS"}</small></span></span></td>
              <td>{x.profile.pocName ?? "—"}<small style={{ display: "block", color: "var(--muted)" }}>{x.profile.pocPhone ?? ""}</small></td>
              <td className="r big">{x.open}</td><td className="r" style={x.late ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{x.late}</td><td className="r">{x.waiting || "—"}</td>
              <td><Mini v={x.health} /><b className="num">{x.health}</b></td><td>{x.invHot ? <span style={{ color: "var(--brand-ink)", fontWeight: 700 }}>{x.inv}</span> : x.inv}</td>
            </tr>))}</tbody></table>{!rows.length ? <div className="empty">No brands assigned to you yet.</div> : null}</div>
        {b ? (
          <div className="card">
            <div className="card-h"><div><div className="eyebrow">{b.company}</div><h2>{b.name}</h2><div className="bar" style={{ marginTop: 8, gap: 6 }}><span className="tag">{p.frequency}</span>{b.heldToday ? <Pill cls="brand">digest held today</Pill> : null}</div></div><Ring v={b.health} /></div>
            <div className="pgrid">
              <Field label="POC" value={p.pocName} /><Field label="POC phone" value={p.pocPhone} /><Field label="WhatsApp" value={p.whatsapp} /><Field label="Official email" value={p.officialEmail} />
              <Field label="Payment terms" value={p.paymentTerms} /><Field label="GSTIN" value={p.gstin} /><Field label="Website"><LinkOrDash href={p.website} /></Field><Field label="Instagram" value={p.instagram} />
              <div className="pf wide"><span>Scope of work</span><Tags items={b.scopeNames} /></div>
              <Field label="Notes" value={p.additionalInformation} wide />
            </div>
            <div><h4>Projects · {b.projects.length}</h4>
              <div className="list" style={{ marginTop: 6 }}>{b.projects.slice(0, 6).map((x) => <div key={x.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "8px 0" }}><div className="t" style={{ fontSize: 13 }}>{x.name}<span>{x.type || "—"} · deadline {x.deadline}</span></div><div className="r"><span className="tag">{x.status}</span></div></div>)}
                {!b.projects.length ? <div className="empty">No projects yet.</div> : null}</div></div>
            <div><h4>Open tasks · {bt.length}</h4>
              <div className="list" style={{ marginTop: 6 }}>{bt.slice(0, 8).map((t) => <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "8px 0", cursor: "pointer" }} onClick={() => openTask(t)}><div className="t" style={{ fontSize: 13 }}>{t.name}<span>{t.assignees.map((a) => a.name).join(", ")} · due {t.due}{t.isLate ? ` · ${t.late}` : ""}</span></div><div className="r"><Pill cls={t.status.cls}>{t.status.name}</Pill></div></div>)}
                {!bt.length ? <div className="empty">Nothing open.</div> : null}</div></div>
            <div className="actions">
              <button className="btn primary" onClick={() => open(<TaskForm brandId={b.id} />)}>New task</button>
              <button className="btn" onClick={() => open(<ProjectForm p={{ brandId: b.id, brandPoc: p.pocName ?? "", pocPhone: p.pocPhone ?? "", terms: p.paymentTerms ?? "" }} />)}>New project</button>
              <button className="btn" onClick={() => open(<ContactForm b={b} />)}>Edit contacts</button>
              <ActionButton action={setDigest} values={{ brandId: b.id, hold: b.heldToday ? "0" : "1" }}>{b.heldToday ? "Resume today's digest" : "Hold today's digest"}</ActionButton>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------- Review queue ----------------
export function ReviewView({ queue, stats }: { queue: TaskVM[]; stats: { avg: string; pass: string; rejected: number } }) {
  const openTask = useLiveDrawer(queue, (t) => <TaskDrawer t={t} flag />, "task");
  return (
    <section className="view on">
      <PageHead eyebrow="Review queue" title={<>Your {em("call.")}</>} sub="Approve and it goes to the client portal (or straight to done if it isn't shared). Reject with one consolidated note — the team gets it in one piece." />
      <Stats items={[[queue.length, "Waiting", queue.length ? "hot" : ""], [stats.avg, "Avg turnaround · month"], [stats.pass, "Passed first time · month", "gold"], [stats.rejected, "Sent back · month"]]} />
      {queue.map((t) => {
        const imgs = t.attachments.filter((a) => a.kind === "upload");
        const links = t.attachments.filter((a) => a.kind === "link");
        const sub = [...t.history].reverse().find((h) => /^In review/.test(h.text));
        return (
          <ActionForm key={t.id} action={reviewTask} keepOpen className="appcard">
            <input type="hidden" name="id" value={t.id} />
            <div className="card-h">
              <div><div className="eyebrow">{t.brand} · {t.project} · submitted {sub?.when ?? "—"} by {sub?.by ?? t.assignees[0]?.name}</div>
                <h2 style={{ fontSize: 22, fontFamily: "Fraunces,Georgia,serif", fontWeight: 300, cursor: "pointer" }} onClick={() => openTask(t)}>{t.name}</h2></div>
              <div className="bar" style={{ gap: 6 }}>{t.isLate ? <Pill cls="brand">{t.late}</Pill> : <Pill cls="dim">due {t.due}</Pill>}{t.share ? <Pill cls="gold">client sees it</Pill> : <Pill cls="dim">internal</Pill>}</div>
            </div>
            {imgs.length ? <div className="prev">{imgs.map((a) => <a key={a.id} href={a.url} target="_blank" rel="noopener"><img src={a.thumb ?? a.url} alt="" /></a>)}</div> : null}
            <div className="bar" style={{ gap: 6 }}>{links.map((a) => <Ext key={a.id} href={a.url}>{a.label}</Ext>)}{!t.attachments.length ? <span className="muted small">No files shared — ask before approving.</span> : null}</div>
            <div className="bar" style={{ gap: 10 }}>{t.assignees.map((a) => <Who key={a.id} n={a.name} sub={a.dept} />)}</div>
            <textarea name="note" style={TA} placeholder="One consolidated note — required to send back, optional with approval" />
            <div className="bar" style={{ gap: 12 }}><span className="muted small">Your rating (feeds their score)</span><StarInput name="stars" initial={t.csRating ?? 0} /></div>
            <div className="appr">
              <button className="btn primary" type="submit" name="decision" value="approve">{t.share ? "Approve → client portal" : "Approve → completed"}</button>
              <button className="btn" type="submit" name="decision" value="reject" style={{ color: "var(--brand-ink)" }}>Send back with note</button>
            </div>
          </ActionForm>
        );
      })}
      {!queue.length ? <div className="empty">Nothing waiting for review. Good flow.</div> : null}
    </section>
  );
}

// ---------------- Client digest ----------------
type Digest = { id: string; name: string; optedIn: boolean; to: string; text: string; todayLine: string; tomorrowLine: string; heldToday: boolean; heldTomorrow: boolean; tomorrow: string };
export function DigestView({ digests, nextLabel }: { digests: Digest[]; nextLabel: string }) {
  return (
    <section className="view on">
      <PageHead eyebrow="Client digest" title={<>The 9:00 {em("WhatsApp.")}</>} sub={`What Sarthi sends each of your brands ${nextLabel}. Add a line it should include, or hold a day when something's sensitive.`} />
      <div className="row r-1-1">
        {digests.map((d) => (
          <section key={d.id} className="card sarthi">
            <div className="card-h"><div><div className="eyebrow">{d.name} · to {d.to}</div><h2 style={{ fontSize: 22 }}>{d.heldTomorrow ? <>Held for {em("tomorrow.")}</> : <>Tomorrow, {em("9:00.")}</>}</h2></div>
              {!d.optedIn ? <Pill cls="dim">client paused digests</Pill> : d.heldTomorrow ? <Pill cls="brand">held</Pill> : <Pill cls="gold">on</Pill>}</div>
            <div className="chat"><div className="bubble a" style={{ maxWidth: "100%", justifySelf: "start", whiteSpace: "pre-wrap", opacity: d.heldTomorrow || !d.optedIn ? 0.5 : 1 }}><small>Sarthi · preview</small>{d.text}{d.tomorrowLine ? `\n\n${d.tomorrowLine}` : ""}</div></div>
            <ActionForm action={setDigest} keepOpen className="">
              <input type="hidden" name="brandId" value={d.id} /><input type="hidden" name="date" value={d.tomorrow} />
              <div className="ask" style={{ borderRadius: 14 }}><input name="line" defaultValue={d.tomorrowLine} placeholder="Add a line — e.g. “Reels go live Friday”" /><button type="submit">Save</button></div>
            </ActionForm>
            <div className="actions"><ActionButton action={setDigest} values={{ brandId: d.id, date: d.tomorrow, hold: d.heldTomorrow ? "0" : "1" }}>{d.heldTomorrow ? "Send tomorrow after all" : "Hold tomorrow"}</ActionButton></div>
          </section>
        ))}
      </div>
      {!digests.length ? <div className="empty">No brands assigned to you yet.</div> : null}
    </section>
  );
}

// ---------------- Flags ----------------
type FlagC = { id: string; c: string; type: string; who: string; subject: string; feedback: string; on: string; pts: number; brand: string; task: string };
export function CsFlagsView({ flags }: { flags: FlagC[] }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const types = [...new Set(flags.map((x) => x.type))];
  const rows = flags.filter((x) => f === "All" || x.type === f);
  return (
    <section className="view on">
      <PageHead eyebrow="Flags" title={<>Said {em("on the record.")}</>} sub="Praise and red flags you've given. They show on the person's profile with your name and move their score (capped ±15 a month)."
        actions={<button className="btn primary" onClick={() => open(<FlagForm employeesOnly />)}><PlusIcon />Raise a flag</button>} />
      <Stats items={[[flags.length, "Given"], [flags.filter((x) => x.pts > 0).length, "Praise", "gold"], [flags.filter((x) => x.pts < 0).length, "Red / concern", "hot"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={[["All", flags.length], ...types.map((t) => [t, flags.filter((x) => x.type === t).length] as [string, number])]} /></div>
      <div className="scroll"><table className="tbl"><thead><tr><th>Person</th><th>Flag</th><th>Subject</th><th>Context</th><th>Given</th><th className="r">Points</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id} style={{ cursor: "default" }}>
            <td><Who n={x.who} /></td><td><Flag c={x.c} style={{ marginLeft: 0, marginRight: 6 }} />{x.type}</td>
            <td className="n">{x.subject}<small>{x.feedback}</small></td><td style={{ color: "var(--muted)" }}>{[x.brand, x.task].filter(Boolean).join(" · ") || "—"}</td>
            <td style={{ color: "var(--muted)" }}>{x.on}</td><td className="r">{x.pts > 0 ? "+" : ""}{x.pts}</td>
          </tr>))}</tbody></table>{!rows.length ? <div className="empty">No flags given yet.</div> : null}</div>
    </section>
  );
}

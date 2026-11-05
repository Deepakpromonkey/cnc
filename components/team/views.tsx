"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionForm, Chips, F, Search, Sel, Switch, UploadOne, useLiveDrawer, useUi } from "../kit";
import { useLookups } from "../lookups";
import { Field, Flag, PageHead, Pill, PlusIcon, Stats, Who, ini } from "../ui";
import { StatusPill, TaskDrawer } from "../admin/task-drawer";
import { TaskCard } from "../admin/tasks-view";
import { PasswordForm } from "../client/forms";
import { EodForm, MyTaskDrawer } from "./desk";
import { logConcern, replyConcern } from "@/app/actions/ops";
import { updateOwnProfile } from "@/app/actions/people";
import { applyLeave } from "@/app/actions/team";
import { CONCERN_CATEGORIES } from "@/lib/status";
import type { TaskVM } from "@/lib/views";

const em = (s: string) => <em style={{ color: "var(--brand-ink)" }}>{s}</em>;
const TA: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--line-strong)", borderRadius: 12, color: "var(--fg)", font: "inherit", padding: "10px 12px", minHeight: 60 };

/** The right drawer for a task: employees get their own desk view; CS get the full drawer. */
function useTaskDrawer(tasks: TaskVM[], role: string, eod: Record<string, string>, initial?: string | null) {
  return useLiveDrawer(tasks, (t) => (role === "cs" ? <TaskDrawer t={t} flag /> : <MyTaskDrawer t={t} eod={eod[t.id]} />), "task", initial);
}

// ---------------- Today ----------------
export type Notice = { id: string; type: string; subject: string; message: string; day: string; mon: string; date: string; by: string; clients: boolean; image: string | null; upcoming: boolean };
export function TodayView({ role, first, greet, counts, desk, mine, eod, att, qa, notices, initialTask }: {
  role: string; first: string; greet: string; counts: { late: number; dueToday: number; review: number; client: number; open: number; brands?: number };
  desk: TaskVM[]; mine: TaskVM[]; eod: Record<string, string>; att: { first: string; soFar: string; open: boolean; lateAfter: string; late: boolean; working: boolean };
  qa: { q: string; a: string; when: string } | null; notices: Notice[]; initialTask?: string | null;
}) {
  const all = useMemo(() => [...desk, ...mine.filter((m) => !desk.some((d) => d.id === m.id))], [desk, mine]);
  const openTask = useTaskDrawer(all, role, eod, initialTask);
  const cs = role === "cs";
  const headline = counts.late ? `${counts.late} ${counts.late === 1 ? "thing is" : "things are"} running late.` : counts.dueToday ? `${counts.dueToday} due today.` : "Nothing late. Good pour.";
  return (
    <section className="view on">
      <section className="hero">
        <div>
          <div className="eyebrow">{cs ? "Your brands, this morning" : "Your desk, this morning"}</div>
          <h1 className="serif" style={{ marginTop: 10 }}>{greet}, <em>{first}.</em><br />{headline}</h1>
          <p><b>{counts.open} task{counts.open === 1 ? "" : "s"}</b> {cs ? <>open across <b>{counts.brands} brand{counts.brands === 1 ? "" : "s"}</b>. {counts.review ? <><Link href="/team/review" style={{ color: "var(--brand-ink)", fontWeight: 600 }}>{counts.review} waiting for your review</Link>.</> : "Your review queue is clear."}</> : <>on your desk. {counts.review ? `${counts.review} with your CS for review.` : ""} Log a line per task before you leave — Sarthi checks at 7:30 pm.</>}</p>
        </div>
        <div className="pour" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
          <div className={`tile${counts.late ? " hot" : ""}`}><div className={`v num${counts.late ? " hot" : ""}`}>{counts.late}</div><div className="l">Late</div></div>
          <div className="tile"><div className="v num">{counts.dueToday}</div><div className="l">Due today</div></div>
          <Link href={cs ? "/team/review" : "/team/tasks"} className="tile"><div className="v num">{counts.review}</div><div className="l">In review</div></Link>
          <div className="tile"><div className="v num">{counts.client}</div><div className="l">With client</div></div>
        </div>
      </section>

      <div className="row r-3-2">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">01 — {cs ? "Needs you" : "On my desk"}</div><h2>{cs ? <>Review & {em("chase.")}</> : <>What&apos;s {em("brewing.")}</>}</h2></div><Link className="link" href={cs ? "/team/tasks" : "/team/tasks"}>All tasks →</Link></div>
          <div className="list">
            {desk.length ? desk.slice(0, 7).map((t) => (
              <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", cursor: "pointer" }} onClick={() => openTask(t)}>
                <div className="t">{t.name}<span><b>{t.brand}</b> · {cs ? t.assignees.map((a) => a.name).join(", ") || "unassigned" : `CS ${t.cs.name.split(" ")[0]}`} · due {t.due}</span></div>
                <div className="r"><StatusPill s={t.status} />{t.isLate ? <time style={{ color: "var(--brand-ink)", fontWeight: 700 }}>{t.late}</time> : null}</div>
              </div>
            )) : <div className="empty">{cs ? "Nothing waiting on you." : "Free hands. Ask your CS what's next."}</div>}
          </div>
        </section>
        <div style={{ display: "grid", gap: 22 }}>
          <section className="card">
            <div className="card-h"><div><div className="eyebrow">02 — Attendance · IST</div><h2>On the {em("floor.")}</h2></div><Link className="link" href="/team/attendance">Calendar →</Link></div>
            <div className="att">
              <div className="big"><b className="num">{att.first}</b><span>{att.first === "—" ? (att.working ? "not signed in yet today" : "studio closed today") : `first login${att.late ? ` · after ${att.lateAfter}` : ""}`}</span></div>
              <div className="legend"><span>{att.first === "—" ? "No punch button — your first login is your in-time." : `${att.soFar} so far${att.open ? " · still in" : ""} · logging out closes the day`}</span></div>
            </div>
          </section>
          <section className="card sarthi">
            <div className="card-h"><div><div className="eyebrow">03 — Sarthi</div><h2>Ask {em("anything.")}</h2></div></div>
            <div className="chat">{qa ? <><div className="bubble q"><small>You · {qa.when}</small>{qa.q}</div><div className="bubble a"><small>Sarthi</small>{qa.a}</div></>
              : <div className="bubble a"><small>Sarthi</small>Use the box at the top — “{cs ? "Kisan ka dieline kab tak?" : "aaj mere kya due hai?"}” — answers come from the same board you see.</div>}</div>
          </section>
        </div>
      </div>

      <div className="row r-3-2">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">04 — End of day</div><h2>Today&apos;s {em("EOD.")}</h2></div><Link className="link" href="/team/eod">History →</Link></div>
          <EodForm tasks={mine} eod={eod} />
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">05 — Noticeboard</div><h2>From the {em("studio.")}</h2></div><Link className="link" href="/team/announce">All →</Link></div>
          <div className="list">{notices.slice(0, 4).map((n) => (
            <div key={n.id} className="item" style={{ gridTemplateColumns: "54px minmax(0,1fr)" }}>
              <div className="late" style={{ color: n.type === "holiday" ? "var(--gold)" : "var(--brand-ink)", fontSize: 22 }}>{n.day}<small>{n.mon}</small></div>
              <div className="t">{n.subject}<span>{n.type === "holiday" ? "Holiday · office closed" : `Notice · ${n.by}`}</span></div>
            </div>))}{!notices.length ? <div className="empty">Nothing pinned.</div> : null}</div>
        </section>
      </div>
    </section>
  );
}

// ---------------- My tasks (employee) ----------------
export function MyTasksView({ tasks, eod, initialTask }: { tasks: TaskVM[]; eod: Record<string, string>; initialTask?: string | null }) {
  const L = useLookups();
  const [mode, setMode] = useState("board");
  const [f, setF] = useState("All");
  const [q, setQ] = useState("");
  const openTask = useTaskDrawer(tasks, "employee", eod, initialTask);
  const filters: Record<string, (t: TaskVM) => boolean> = {
    All: (t) => !t.status.isDone, Late: (t) => t.isLate, "Due today": (t) => t.dueToday && !t.status.isDone, Rejected: (t) => t.status.isRejected, Done: (t) => t.status.isDone,
  };
  const rows = tasks.filter((t) => filters[f](t) && (!q || `${t.name} ${t.brand} ${t.project}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="view on">
      <PageHead eyebrow="My tasks" title={<>Your {em("desk.")}</>} sub="Start it, share your work, submit for review. Rejections come back here with one consolidated note."
        actions={<Chips value={mode} onChange={setMode} items={[["board", null, "Board"], ["list", null, "List"]]} />} />
      <Stats items={[[tasks.filter(filters.All).length, "Open"], [tasks.filter(filters.Late).length, "Late", "hot"], [tasks.filter(filters["Due today"]).length, "Due today"], [tasks.filter((t) => t.status.isReview).length, "In review"], [tasks.filter(filters.Done).length, "Done · 30 days", "gold"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={Object.keys(filters).map((k) => [k, tasks.filter(filters[k]).length])} /><Search value={q} onChange={setQ} placeholder="Search task, brand" /></div>
      {mode === "board" ? (
        <div className="board" style={{ "--cols": Math.max(1, L.statuses.filter((s) => (f === "Done" ? s.isDone : !s.isDone)).length) } as React.CSSProperties}>{L.statuses.filter((s) => (f === "Done" ? s.isDone : !s.isDone)).map((s) => {
          const ts = rows.filter((t) => t.status.id === s.id);
          return <div key={s.id} className={`col${s.isRejected ? " hot" : s.isDone ? " done" : ""}`}><h3><span>{s.name}</span><b>{ts.length}</b></h3>
            <div className="cards">{ts.length ? ts.map((t) => <TaskCard key={t.id} t={t} onOpen={() => openTask(t)} />) : <div className="empty" style={{ padding: 14 }}>—</div>}</div></div>;
        })}</div>
      ) : (
        <div className="scroll"><table className="tbl"><thead><tr><th>Task</th><th>Brand · Project</th><th>CS</th><th>Due (IST)</th><th>Status</th><th>Shared</th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id} onClick={() => openTask(t)}>
              <td className="n">{t.name}<small>{t.code}</small></td><td className="n">{t.brand}<small>{t.project}</small></td><td><Who n={t.cs.name} /></td>
              <td style={t.isLate ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{t.due}{t.isLate ? <><br /><small>{t.late}</small></> : null}</td>
              <td><StatusPill s={t.status} /></td><td>{t.attachments.length ? <span className="lnk">🔗 {t.attachments.length}</span> : <span className="faint">—</span>}</td>
            </tr>))}</tbody></table>{!rows.length ? <div className="empty">Nothing here.</div> : null}</div>
      )}
    </section>
  );
}

// ---------------- EOD log ----------------
export function EodView({ tasks, eod, history, todayLabel }: { tasks: TaskVM[]; eod: Record<string, string>; history: { day: string; lines: { task: string; brand: string; remark: string; status: string }[] }[]; todayLabel: string }) {
  return (
    <section className="view on">
      <PageHead eyebrow="EOD log" title={<>What moved, {em("every day.")}</>} sub="One line per active task, every working day. Your CS reads these; missing lines show up in your score." />
      <section className="card"><div className="card-h"><div><div className="eyebrow">Today · {todayLabel}</div><h2>Log the {em("day.")}</h2></div></div><EodForm tasks={tasks} eod={eod} /></section>
      {history.map((d) => (
        <section key={d.day} className="card"><div className="card-h"><div><div className="eyebrow">{d.day}</div></div><span className="tag">{d.lines.length} line{d.lines.length === 1 ? "" : "s"}</span></div>
          <div className="tl">{d.lines.map((l, i) => <div key={i}>{l.remark}<small>{l.brand} · {l.task}{l.status ? ` · ${l.status}` : ""}</small></div>)}</div></section>
      ))}
      {!history.length ? <div className="empty">No EOD lines yet.</div> : null}
    </section>
  );
}

// ---------------- Attendance ----------------
type Att = {
  month: string; offset: number; cal: { day: number; state: string; hours: number | null; today: boolean }[]; lateAfter: string; first: string; soFar: string; open: boolean;
  present: number; late: number; absent: number; avg: string; leavesLeft: number; allowance: number;
  sessions: { login: string; logout: string; open: boolean; auto: boolean }[]; leaves: { id: string; from: string; to: string; type: string; reason: string; status: string }[];
};
const DAY_STYLE: Record<string, React.CSSProperties> = {
  present: { background: "var(--gold-soft)", borderColor: "var(--gold)" }, late: { background: "var(--gold-soft)", borderColor: "var(--gold)", opacity: 0.7 },
  absent: { background: "var(--brand-soft)", borderColor: "var(--brand-ink)" }, leave: { background: "var(--surface-3)" }, holiday: { background: "var(--gold-soft)" },
  weekend: { opacity: 0.45 }, future: { opacity: 0.35 }, today: { borderColor: "var(--fg)" },
};
function LeaveForm() {
  const { close } = useUi();
  return (
    <ActionForm action={applyLeave} className="dform">
      <div className="eyebrow">Apply for leave</div><h2>Time {em("off.")}</h2>
      <div className="form">
        <div className="two"><F label="From"><input type="date" name="fromDate" required /></F><F label="To"><input type="date" name="toDate" /></F></div>
        <F label="Type"><Sel name="type" options={[["casual", "Casual"], ["sick", "Sick"], ["half_day", "Half day"], ["wfh", "Work from home"]]} value="casual" /></F>
        <F label="Reason"><textarea name="reason" style={TA} /></F>
        <p className="muted small" style={{ margin: 0 }}>Goes to admin. Approved days show as leave on your calendar and don&apos;t count as absent.</p>
      </div>
      <div className="actions"><button className="btn primary" type="submit">Send request</button><button className="btn" type="button" onClick={close}>Cancel</button></div>
    </ActionForm>
  );
}
export function MyAttendanceView({ a }: { a: Att }) {
  const { open } = useUi();
  return (
    <section className="view on">
      <PageHead eyebrow="Attendance · IST" title={<>Your {em("days.")}</>} sub={`First login to last logout, in Indian time. No punch button — logins after ${a.lateAfter} count as late.`}
        actions={<button className="btn primary" onClick={() => open(<LeaveForm />)}><PlusIcon />Apply for leave</button>} />
      <Stats items={[[a.present + a.late, "Days present"], [a.late, "Late logins", a.late > 2 ? "hot" : ""], [a.absent, "Absent", a.absent ? "hot" : ""], [a.avg, "Avg day"], [`${a.leavesLeft} / ${a.allowance}`, "Leaves left", "gold"]]} />
      <div className="row r-3-2">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">{a.month}</div><h2>The {em("month.")}</h2></div><span className="muted small">Today: {a.first === "—" ? "not in yet" : `in at ${a.first} · ${a.soFar}`}</span></div>
          <div className="calendar">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="eyebrow" style={{ textAlign: "center" }}>{d}</div>)}
            {Array.from({ length: a.offset }, (_, i) => <div key={`o${i}`} />)}
            {a.cal.map((d) => (
              <div key={d.day} title={d.state} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "6px 4px", textAlign: "center", fontSize: 12, ...DAY_STYLE[d.state], ...(d.today ? DAY_STYLE.today : {}) }}>
                <b className="num">{d.day}</b><div className="faint" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".06em" }}>{d.state === "future" ? "" : d.hours ? `${d.hours.toFixed(1)}h` : d.state}</div>
              </div>))}
          </div>
          <div className="legend"><span>Gold = present · faded gold = late · crimson = absent · grey = leave/weekend</span></div>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Leave</div><h2>My {em("requests.")}</h2></div></div>
          <div className="list">{a.leaves.length ? a.leaves.map((l) => (
            <div key={l.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><div className="t">{l.type}<span>{l.from}{l.to !== l.from ? ` → ${l.to}` : ""}{l.reason ? ` · ${l.reason}` : ""}</span></div>
              <div className="r"><Pill cls={l.status === "approved" ? "gold" : l.status === "rejected" ? "brand" : "dim"}>{l.status}</Pill></div></div>)) : <div className="empty">No leave requests.</div>}</div>
        </section>
      </div>
      <section className="card"><div className="card-h"><div><div className="eyebrow">Last 14 days</div><h2>Sessions</h2></div></div>
        <div className="scroll"><table className="tbl" style={{ minWidth: 0 }}><thead><tr><th>Login</th><th>Logout</th><th>Session</th></tr></thead>
          <tbody>{a.sessions.map((s, i) => <tr key={i} style={{ cursor: "default" }}><td>{s.login}</td><td>{s.logout}{s.auto ? <> <Pill cls="brand">auto</Pill></> : null}</td><td>{s.open ? <Pill cls="gold">open</Pill> : <Pill cls="dim">closed</Pill>}</td></tr>)}</tbody></table>
          {!a.sessions.length ? <div className="empty">No sessions yet.</div> : null}</div></section>
    </section>
  );
}

// ---------------- Concerns ----------------
type ConcernC = { id: string; code: string; subject: string; details: string; cat: string; when: string; owner: string; status: string; label: string; cls: string; confidential: boolean; file: string | null; thread: { who: string; when: string; body: string; mine: boolean }[] };
function ConcernForm() {
  const { close } = useUi();
  return (
    <ActionForm action={logConcern} className="dform">
      <div className="eyebrow">Raise a concern</div><h2>Say it, it&apos;s {em("heard.")}</h2>
      <div className="form">
        <F label="Category"><Sel name="category" options={Object.entries(CONCERN_CATEGORIES)} value="workload" /></F>
        <F label="Subject"><input name="subject" required /></F>
        <F label="Details"><textarea name="details" style={{ ...TA, minHeight: 110 }} required placeholder="What happened, since when, what would help" /></F>
        <UploadOne name="file" label="Screenshot (optional)" hint="Chats, a brief, anything that helps" />
        <Switch name="confidential" label="Confidential" sub="Only admin and HR see it — hidden from CS leads" />
        <p className="muted small" style={{ margin: 0 }}>HR replies within 24 hours. You&apos;ll see replies here and on WhatsApp.</p>
      </div>
      <div className="actions"><button className="btn primary" type="submit">Raise concern</button><button className="btn" type="button" onClick={close}>Cancel</button></div>
    </ActionForm>
  );
}
function ConcernCard({ c, canReply }: { c: ConcernC; canReply: boolean }) {
  return (
    <section className="card">
      <div className="card-h"><div><div className="eyebrow">{c.code} · {c.cat}{c.confidential ? " · confidential" : ""} · {c.when}</div><h2 style={{ fontSize: 22 }}>{c.subject}</h2></div><Pill cls={c.cls}>{c.label}</Pill></div>
      <div className="bubble q" style={{ maxWidth: "100%" }}><small>{canReply ? "You" : c.owner.split(" → ")[0]}</small>{c.details}</div>
      {c.file ? <a href={c.file} target="_blank" rel="noopener" className="thumbs"><span className="th"><img src={c.file} alt="" /><span>screenshot</span></span></a> : null}
      {c.thread.map((m, i) => <div key={i} className={`bubble ${m.mine ? "q" : "a"}`} style={{ maxWidth: "100%" }}><small>{m.who} · {m.when}</small>{m.body}</div>)}
      {canReply && c.status !== "resolved" ? (
        <ActionForm action={replyConcern} keepOpen resetOnSuccess className="">
          <input type="hidden" name="id" value={c.id} />
          <div className="ask" style={{ borderRadius: 14 }}><input name="body" placeholder={`Add to this · owner ${c.owner}`} /><button type="submit">Send</button></div>
        </ActionForm>
      ) : <p className="muted small" style={{ margin: 0 }}>{canReply ? "Resolved." : `Owner: ${c.owner.split(" → ")[1]} · read only`}</p>}
    </section>
  );
}
export function MyConcernsView({ mine, team }: { mine: ConcernC[]; team: ConcernC[] }) {
  const { open } = useUi();
  return (
    <section className="view on">
      <PageHead eyebrow="Concerns" title={<>What you {em("need to say.")}</>} sub="Seen by admin and HR. Mark it confidential and your CS lead won't see it. Every concern gets an owner and a reply."
        actions={<button className="btn primary" onClick={() => open(<ConcernForm />)}><PlusIcon />Raise a concern</button>} />
      <Stats items={[[mine.filter((c) => c.status === "open").length, "Waiting for a reply", mine.some((c) => c.status === "open") ? "hot" : ""], [mine.filter((c) => c.status === "in_discussion").length, "In discussion"], [mine.filter((c) => c.status === "resolved").length, "Resolved", "gold"]]} />
      {mine.map((c) => <ConcernCard key={c.id} c={c} canReply />)}
      {!mine.length ? <div className="empty">Nothing raised. If something&apos;s bothering you, this is the place.</div> : null}
      {team.length ? <><div className="eyebrow" style={{ marginTop: 10 }}>From people on your brands · read only · not confidential</div>{team.map((c) => <ConcernCard key={c.id} c={c} canReply={false} />)}</> : null}
    </section>
  );
}

// ---------------- Announcements ----------------
export function NoticesView({ notices }: { notices: Notice[] }) {
  const [f, setF] = useState("All");
  const rows = notices.filter((n) => f === "All" || (f === "Holidays" ? n.type === "holiday" : f === "Upcoming" ? n.upcoming : n.type === "announcement"));
  return (
    <section className="view on">
      <PageHead eyebrow="Announcements & holidays" title={<>Pinned to the {em("noticeboard.")}</>} />
      <div className="bar"><Chips value={f} onChange={setF} items={[["All", notices.length], ["Announcements", notices.filter((n) => n.type === "announcement").length], ["Holidays", notices.filter((n) => n.type === "holiday").length], ["Upcoming", notices.filter((n) => n.upcoming).length]]} /></div>
      {rows.map((n) => (
        <section key={n.id} className="card" style={{ gridTemplateColumns: "70px 1fr", display: "grid", gap: 16, alignItems: "start" }}>
          <div className="late" style={{ color: n.type === "holiday" ? "var(--gold)" : "var(--brand-ink)", fontSize: 26 }}>{n.day}<small>{n.mon}</small></div>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="bar" style={{ gap: 8 }}>{n.type === "holiday" ? <Pill cls="gold">Holiday · studio closed</Pill> : <Pill cls="brand">Notice</Pill>}<span className="muted small">{n.by}</span></div>
            <h2 style={{ fontFamily: "Fraunces,Georgia,serif", fontSize: 20, fontWeight: 400 }}>{n.subject}</h2>
            {n.message ? <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>{n.message}</p> : null}
            {n.image ? <img src={n.image} alt="" style={{ maxWidth: 420, borderRadius: 14 }} /> : null}
          </div>
        </section>
      ))}
      {!rows.length ? <div className="empty">Nothing pinned.</div> : null}
    </section>
  );
}

// ---------------- My score ----------------
type ScoreC = { visible: boolean; score: number | null; last: number | null; rank: number | null; of: number; computed: string | null; params: { key: string; label: string; raw: string; value: number; weight: number }[]; flagPts: number; lift: string; flags: { c: string; type: string; subject: string; feedback: string; by: string; on: string; pts: number }[] };
export function ScoreView({ s, dept, month }: { s: ScoreC; dept: string; month: string }) {
  if (!s.visible) return <section className="view on"><PageHead eyebrow="My score" title={<>Hidden for {em("now.")}</>} sub="Admin has turned off score visibility. Your flags and feedback still reach you." /></section>;
  const delta = s.score !== null && s.last !== null ? s.score - s.last : null;
  return (
    <section className="view on">
      <PageHead eyebrow={`My score · ${month}`} title={<>How your month is {em("brewing.")}</>} sub="Built every night from the work itself — on time, first-pass reviews, CS ratings, EOD lines, attendance. Flags move it up or down, capped at ±15." />
      {s.score === null ? <div className="empty">Your first score appears after tonight&apos;s 00:30 run.</div> : (
        <div className="row r-2-3">
          <section className="card">
            <div className="eyebrow">This month</div>
            <b className="num" style={{ fontFamily: "Fraunces,Georgia,serif", fontSize: 96, fontWeight: 300, lineHeight: 1 }}>{s.score}</b>
            <div className="bar" style={{ gap: 8 }}>
              {s.rank ? <Pill cls="gold">#{s.rank} of {s.of} · {dept}</Pill> : null}
              {delta !== null ? <Pill cls={delta >= 0 ? "gold" : "brand"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs last month ({s.last})</Pill> : null}
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>{s.lift}</p>
            <p className="muted small" style={{ margin: 0 }}>Flags {s.flagPts >= 0 ? "+" : ""}{s.flagPts}{s.computed ? ` · computed ${s.computed}` : ""}</p>
          </section>
          <section className="card">
            <div className="card-h"><div><div className="eyebrow">Parameters</div><h2>What makes the {em("number.")}</h2></div></div>
            <div className="team">{s.params.map((p) => (
              <div key={p.key} className="member" style={{ gridTemplateColumns: "minmax(0,1fr) 120px 44px" }}>
                <div className="n" style={{ fontSize: 12 }}>{p.label}<span>weight {p.weight} · {p.raw}</span></div>
                <div className="bar"><i style={{ width: `${Math.round(p.value)}%` }} /></div><b className="s num" style={{ fontSize: 16 }}>{Math.round(p.value)}</b>
              </div>))}</div>
          </section>
        </div>
      )}
      <section className="card"><div className="card-h"><div><div className="eyebrow">Flags received</div><h2>On the {em("record.")}</h2></div></div>
        {s.flags.length ? <div className="tl">{s.flags.map((f, i) => <div key={i} className={f.pts < 0 ? "red" : ""}><Flag c={f.c} style={{ marginLeft: 0, marginRight: 6 }} />{f.type} · {f.subject} — {f.feedback}<small>{f.by} · {f.on} · {f.pts > 0 ? "+" : ""}{f.pts}</small></div>)}</div>
          : <p className="muted" style={{ margin: 0 }}>No flags. Steady pour.</p>}</section>
    </section>
  );
}

// ---------------- Profile ----------------
type Prof = { id: string; name: string; role: string; dept: string; desig: string; photo: string | null; fields: Record<string, string | null> };
function ProfileForm({ p }: { p: Prof }) {
  const { close } = useUi();
  const x = p.fields;
  const fi = (label: string, k: string) => <F label={label}><input name={k} defaultValue={x[k] ?? ""} /></F>;
  return (
    <ActionForm action={updateOwnProfile} className="dform">
      <div className="eyebrow">Edit profile</div><h2>{p.name}</h2>
      <div className="form">
        <UploadOne name="photo" label="Photo" hint="Square works best · shows on tasks and attendance" round existing={p.photo} />
        <div className="two">{fi("Mobile", "mobile")}{fi("WhatsApp (Sarthi messages you here)", "whatsappNo")}</div>
        <div className="two">{fi("Personal email", "personalEmail")}{fi("Personal contact", "personalContact")}</div>
        {fi("Address", "address")}
        <div className="two">{fi("City", "city")}{fi("State", "state")}</div>
        {fi("Pincode", "pincode")}
        <div className="two">{fi("LinkedIn", "linkedin")}{fi("Instagram", "instagram")}</div>
        {fi("Facebook", "facebook")}
        <p className="muted small" style={{ margin: 0 }}>Name, role, department and designation are set by admin.</p>
      </div>
      <div className="actions"><button className="btn primary" type="submit">Save</button><button className="btn" type="button" onClick={close}>Cancel</button></div>
    </ActionForm>
  );
}
export function ProfileView({ p }: { p: Prof }) {
  const { open } = useUi();
  const x = p.fields;
  return (
    <section className="view on">
      <PageHead eyebrow="Profile" title={<>That&apos;s {em("you.")}</>} actions={<><button className="btn" onClick={() => open(<PasswordForm />)}>Change password</button><button className="btn primary" onClick={() => open(<ProfileForm p={p} />)}>Edit profile</button></>} />
      <section className="card">
        <div className="card-h"><div className="bar" style={{ gap: 14 }}>
          <span className="blogo" style={{ width: 64, height: 64, fontSize: 18 }}>{p.photo ? <img src={p.photo} alt="" /> : ini(p.name)}</span>
          <div><div className="eyebrow">{p.role === "cs" ? "Client servicing" : "Team"} · {p.dept}</div><h2>{p.name}</h2><span className="muted small">{p.desig}</span></div></div></div>
        <div className="pgrid">
          <Field label="Work email" value={x.email} /><Field label="Login ID" value={x.loginId} /><Field label="Mobile" value={x.mobile} /><Field label="WhatsApp" value={x.whatsappNo} />
          <Field label="Personal email" value={x.personalEmail} /><Field label="Personal contact" value={x.personalContact} /><Field label="Date of birth" value={x.dob} /><Field label="Gender" value={x.gender} />
          <Field label="Address" value={x.address} wide /><Field label="City" value={x.city} /><Field label="State" value={x.state} /><Field label="Pincode" value={x.pincode} /><Field label="Country" value={x.country} />
          <Field label="LinkedIn" value={x.linkedin} /><Field label="Instagram" value={x.instagram} /><Field label="Facebook" value={x.facebook} />
        </div>
      </section>
    </section>
  );
}

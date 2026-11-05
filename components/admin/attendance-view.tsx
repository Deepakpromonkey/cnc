"use client";
import { useState } from "react";
import { ActionButton, ActionForm, Chips, useLiveDrawer } from "../kit";
import { PageHead, Pill, Stats } from "../ui";
import { attendanceRemark, decideLeave, markLeaveToday } from "@/app/actions/ops";

type Day = { k: string; label: string; state: string; hours: number | null };
export type AttPerson = {
  id: string; name: string; role: string; dept: string; first: string; last: string; hours: string; state: string; auto: boolean; remark: string;
  week: Day[]; month: { present: number; late: number; absent: number; leave: number; avg: string };
  sessions: { login: string; logout: string; open: boolean; auto: boolean; ip: string }[];
};
type Leave = { id: string; who: string; from: string; to: string; type: string; reason: string; status: string };

const STATE: Record<string, [string, string]> = {
  present: ["on floor", "gold"], late: ["late", "dim"], absent: ["not in", "brand"], leave: ["on leave", "dim"], holiday: ["holiday", "gold"], weekend: ["off", "dim"],
};
const dot = (s: string) => (s === "present" ? "p" : s === "late" ? "l" : s === "absent" ? "a" : "");

function LogDrawer({ p, todayKey }: { p: AttPerson; todayKey: string }) {
  return (
    <>
      <div className="eyebrow">Login log · IST</div>
      <h2>{p.name}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Attendance = first login to last logout of the day. Every session is kept; auto-logouts at midnight are marked.</p>
      <div className="scroll"><table className="tbl" style={{ minWidth: 0 }}><thead><tr><th>Login</th><th>Logout</th><th>Session</th></tr></thead>
        <tbody>{p.sessions.length ? p.sessions.map((s, i) => (
          <tr key={i} style={{ cursor: "default" }}><td>{s.login}</td><td>{s.logout}{s.auto ? <> <Pill cls="brand">auto</Pill></> : null}</td><td>{s.open ? <Pill cls="gold">open</Pill> : <Pill cls="dim">closed</Pill>}</td></tr>
        )) : <tr><td colSpan={3} className="empty">No sessions this week.</td></tr>}</tbody></table></div>
      <ActionForm action={attendanceRemark} keepOpen className="dform">
        <input type="hidden" name="userId" value={p.id} /><input type="hidden" name="date" value={todayKey} />
        <div><h4>Remark · today</h4><input type="text" name="remark" defaultValue={p.remark} style={{ marginTop: 8 }} placeholder="e.g. client visit, WFH, half day" /></div>
        <div><h4>Override today (audited)</h4>
          <select name="state" defaultValue="" style={{ marginTop: 8 }}><option value="">Keep computed state ({STATE[p.state]?.[0] ?? p.state})</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="leave">Leave</option></select></div>
        <div className="actions"><button className="btn primary" type="submit">Save</button>
          <ActionButton action={markLeaveToday} values={{ userId: p.id, date: todayKey }} confirm={`Mark ${p.name} on leave today?`}>Mark on leave</ActionButton></div>
      </ActionForm>
    </>
  );
}

export function AttendanceView({ people, todayKey, todayLabel, working, avgMonth, lateAfter, leaves }: { people: AttPerson[]; todayKey: string; todayLabel: string; working: boolean; avgMonth: string; lateAfter: string; leaves: Leave[] }) {
  const [range, setRange] = useState("today");
  const openLog = useLiveDrawer(people, (p) => <LogDrawer p={p} todayKey={todayKey} />, "att");
  const inN = people.filter((p) => p.first !== "—").length;
  const pending = leaves.filter((l) => l.status === "pending");
  return (
    <section className="view on">
      <PageHead eyebrow="Attendance · IST" title={<>Who&apos;s <em>on the floor.</em></>} sub="First login to last logout, every day, in Indian time. No punch buttons, nothing to forget."
        actions={<Chips value={range} onChange={setRange} items={[["today", null, `Today · ${todayLabel}`], ["week", null, "This week"], ["month", null, "Month"]]} />} />
      <Stats items={[[`${inN} / ${people.length}`, working ? "In today" : "In today · studio closed", "gold"], [people.filter((p) => p.state === "late").length, `Late (after ${lateAfter})`], [working ? people.filter((p) => p.state === "absent").length : 0, "Not in", "hot"], [people.filter((p) => p.state === "leave").length, "On leave"], [avgMonth, "Avg day · month"]]} />
      {pending.length ? (
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Leave requests</div><h2>Waiting on <em>you.</em></h2></div></div>
          <div className="list">{pending.map((l) => (
            <div key={l.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div className="t">{l.who} · {l.type}<span>{l.from} → {l.to}{l.reason ? ` · ${l.reason}` : ""}</span></div>
              <div className="r" style={{ display: "flex", gap: 6 }}>
                <ActionButton action={decideLeave} values={{ id: l.id, decision: "approved" }} className="btn primary">Approve</ActionButton>
                <ActionButton action={decideLeave} values={{ id: l.id, decision: "rejected" }}>Decline</ActionButton>
              </div>
            </div>))}</div>
        </section>
      ) : null}
      <div className="scroll">
        {range === "today" ? (
          <table className="tbl"><thead><tr><th>Person</th><th>Role</th><th>First login</th><th>Last logout</th><th className="r">Hours</th><th>Status</th><th>This week</th></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={p.id} onClick={() => openLog(p)}>
                <td className="n">{p.name}<small>{p.dept}</small></td><td style={{ color: "var(--muted)" }}>{p.role}</td><td>{p.first}</td>
                <td style={{ color: "var(--muted)" }}>{p.last}{p.auto ? <> <Pill cls="brand">auto</Pill></> : null}</td><td className="r">{p.hours}</td>
                <td>{!working && p.state === "absent" ? <Pill cls="dim">off</Pill> : <Pill cls={STATE[p.state]?.[1] ?? ""}>{STATE[p.state]?.[0] ?? p.state}</Pill>}{p.remark ? <small style={{ display: "block", color: "var(--muted)" }}>{p.remark}</small> : null}</td>
                <td><span className="dots">{p.week.map((d) => <i key={d.k} className={dot(d.state)} title={`${d.label} · ${d.state}`} />)}</span></td>
              </tr>))}</tbody></table>
        ) : range === "week" ? (
          <table className="tbl"><thead><tr><th>Person</th>{people[0]?.week.map((d) => <th key={d.k}>{d.label}</th>)}<th className="r">Hours</th></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={p.id} onClick={() => openLog(p)}>
                <td className="n">{p.name}<small>{p.dept}</small></td>
                {p.week.map((d) => <td key={d.k}>{d.state === "future" ? <span style={{ color: "var(--faint)" }}>·</span> : <Pill cls={STATE[d.state]?.[1] ?? ""}>{STATE[d.state]?.[0] ?? d.state}</Pill>}</td>)}
                <td className="r">{p.week.reduce((s, d) => s + (d.hours ?? 0), 0).toFixed(1)} h</td>
              </tr>))}</tbody></table>
        ) : (
          <table className="tbl"><thead><tr><th>Person</th><th className="r">Present</th><th className="r">Late</th><th className="r">Absent</th><th className="r">Leave</th><th className="r">Avg day</th></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={p.id} onClick={() => openLog(p)}>
                <td className="n">{p.name}<small>{p.dept}</small></td><td className="r">{p.month.present}</td>
                <td className="r" style={p.month.late > 2 ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{p.month.late}</td>
                <td className="r">{p.month.absent}</td><td className="r">{p.month.leave}</td><td className="r">{p.month.avg}</td>
              </tr>))}</tbody></table>
        )}
      </div>
    </section>
  );
}

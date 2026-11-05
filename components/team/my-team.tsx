"use client";
import { useMemo, useState } from "react";
import { useLiveDrawer, useUi } from "../kit";
import { PageHead, Pill, Stats, Who } from "../ui";
import { StatusPill, TaskDrawer } from "../admin/task-drawer";
import { FlagForm } from "../admin/forms";
import type { MyTeam } from "@/lib/team-views";

// CS → the employees who report to them (hierarchy, client request 2026-11-04).

const STATE: Record<string, [string, string]> = {
  present: ["gold", "in"], late: ["dim", "late"], absent: ["brand", "not in"], leave: ["dim", "on leave"],
  holiday: ["dim", "holiday"], weekend: ["dim", "off"],
};

export function MyTeamView({ team }: { team: MyTeam }) {
  const { open } = useUi();
  const all = useMemo(() => team.people.flatMap((p) => p.desk), [team]);
  const openTask = useLiveDrawer(all, (t) => <TaskDrawer t={t} flag />, "task");
  const [sel, setSel] = useState<string | null>(team.people[0]?.id ?? null);
  const p = team.people.find((x) => x.id === sel) ?? team.people[0];
  const inNow = team.people.filter((x) => x.in !== "—").length;

  return (
    <section className="view on">
      <PageHead eyebrow="My team" title={<>The people who <em>report to you.</em></>}
        sub="Their desk, today's attendance and EOD, and this month's score. Your group admin decides who reports to whom." />
      <Stats items={[[team.people.length, "Report to you"], [inNow, "In today", "gold"], [team.people.reduce((s, x) => s + x.late, 0), "Late tasks", "hot"], [team.people.filter((x) => !x.eodDone && x.open).length, "EOD pending"], [team.leaves.filter((l) => l.status === "pending").length, "Leave pending"]]} />
      {!team.people.length ? <div className="card"><div className="empty">Nobody reports to you yet. Your group admin sets this in Users &amp; access.</div></div> : (
        <div className="row r-3-2">
          <section className="card">
            <div className="scroll"><table className="tbl tight">
              <thead><tr><th>Person</th><th>In at</th><th>Today</th><th>Open</th><th>Late</th><th>EOD</th><th>Score</th></tr></thead>
              <tbody>{team.people.map((x) => {
                const [cls, label] = STATE[x.state] ?? ["dim", x.state];
                return (
                  <tr key={x.id} onClick={() => setSel(x.id)} className={x.id === p?.id ? "on" : undefined}>
                    <td className="n"><Who n={x.name} sub={[x.desig, x.dept].filter(Boolean).join(" · ")} /></td>
                    <td className="num">{x.in}</td>
                    <td><Pill cls={cls}>{label}</Pill></td>
                    <td className="num">{x.open}</td>
                    <td className="num" style={x.late ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{x.late}</td>
                    <td><Pill cls={x.eodDone ? "gold" : x.open ? "brand" : "dim"}>{x.eod}</Pill></td>
                    <td className="num">{x.score ?? "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </section>

          {p ? (
            <section className="card">
              <div className="card-h"><div><div className="eyebrow">{p.desig || "Team"}</div><h2>{p.name}</h2></div>
                <button className="btn" onClick={() => open(<FlagForm personId={p.id} employeesOnly />)}>Raise a flag</button></div>
              <div className="eyebrow">On their desk</div>
              <div className="list">
                {p.desk.length ? p.desk.map((t) => (
                  <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", cursor: "pointer" }} onClick={() => openTask(t)}>
                    <div className="t">{t.name}<span><b>{t.brand}</b> · CS {t.cs.name.split(" ")[0]} · due {t.due}</span></div>
                    <div className="r"><StatusPill s={t.status} />{t.isLate ? <time style={{ color: "var(--brand-ink)", fontWeight: 700 }}>{t.late}</time> : null}</div>
                  </div>
                )) : <div className="empty">Nothing open.</div>}
              </div>
              <div className="eyebrow" style={{ marginTop: 12 }}>Today&apos;s EOD</div>
              <div className="list">
                {p.lines.length ? p.lines.map((l, i) => (
                  <div key={i} className="item" style={{ gridTemplateColumns: "minmax(0,1fr)" }}><div className="t">{l.task}<span>{l.remark}{l.status ? ` · ${l.status}` : ""}</span></div></div>
                )) : <div className="empty">No EOD lines yet today.</div>}
              </div>
            </section>
          ) : null}
        </div>
      )}
      {team.leaves.length ? (
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Leave</div><h2>Coming up <em>& pending.</em></h2></div></div>
          <div className="scroll"><table className="tbl tight"><thead><tr><th>Who</th><th>From</th><th>To</th><th>Type</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>{team.leaves.map((l) => (
              <tr key={l.id}><td>{l.who}</td><td>{l.from}</td><td>{l.to}</td><td>{l.type}</td><td style={{ color: "var(--muted)" }}>{l.reason}</td>
                <td><Pill cls={l.status === "approved" ? "gold" : l.status === "pending" ? "brand" : "dim"}>{l.status}</Pill></td></tr>
            ))}</tbody></table></div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Your group admin approves leave; you see it here so you can plan the desk.</p>
        </section>
      ) : null}
    </section>
  );
}

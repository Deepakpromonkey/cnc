"use client";
import { useMemo, useState } from "react";
import { ActionForm, Chips, Switch, useLiveDrawer, useUi } from "../kit";
import { useLookups } from "../lookups";
import { Flag, Mini, PageHead, PlusIcon, Stats } from "../ui";
import { FlagForm, UserForm } from "./forms";
import { StatusPill, TaskDrawer } from "./task-drawer";
import { saveWeights } from "@/app/actions/settings";
import type { TaskVM } from "@/lib/views";

export type PersonVM = {
  id: string; name: string; dept: string; desig: string; score: number; last: number | null; rank: number | null; tasks: number; ontime: number; pass: number; cs: string; eod: number; att: number;
  breakdown: { key: string; label: string; raw: string; value: number; weight: number }[]; flagPts: number;
  flags: { c: string; type: string; subject: string; feedback: string; by: string; on: string; pts: number }[]; open: TaskVM[];
};
export type CsVM = { id: string; name: string; desig: string; brands: string[]; score: number | null; open: number; late: number; unanswered: number; rating: string; flags: { c: string; subject: string }[] };
type Rule = { key: string; label: string; source: string; weight: number; enabled: boolean };

function RulesDrawer({ rules, praise, visible }: { rules: Rule[]; praise: { cs: number; admin: number }; visible: boolean }) {
  const L = useLookups();
  return (
    <ActionForm action={saveWeights} className="dform">
      <div className="eyebrow">Scoring rules</div>
      <h2>How a score is <em style={{ color: "var(--brand-ink)" }}>brewed.</em></h2>
      <p style={{ fontSize: 13, color: "var(--fg-2)", margin: 0 }}>Computed nightly at 00:30 IST from the database. Nobody types a score in; flags are the only human input, and they&apos;re logged with a name.</p>
      <div className="scroll"><table className="tbl" style={{ minWidth: 0 }}><thead><tr><th>Parameter</th><th>Source</th><th className="r">Weight</th><th>On</th></tr></thead>
        <tbody>{rules.map((r) => (
          <tr key={r.key} style={{ cursor: "default" }}>
            <td className="n">{r.label}</td><td style={{ color: "var(--muted)", fontSize: 12 }}>{r.source}</td>
            <td className="r"><input name={`w_${r.key}`} type="number" min={0} max={100} defaultValue={r.weight} style={{ width: 64, background: "var(--bg)", border: "1px solid var(--line-strong)", borderRadius: 8, color: "var(--fg)", padding: "4px 6px", textAlign: "right" }} /></td>
            <td><input type="checkbox" name={`e_${r.key}`} defaultChecked={r.enabled} /></td>
          </tr>
        ))}</tbody></table></div>
      <div><h4>Flags</h4>
        <p style={{ fontSize: 13, margin: "6px 0 10px" }}>{L.flagTypes.map((f) => `${f.name}: ${f.points > 0 ? "+" : ""}${f.points}`).join(" · ")}. Capped at ±15 a month. Scores reset monthly.</p>
        <div className="two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">Praise from CS<input name="praise_cs" type="number" defaultValue={praise.cs} /></div>
          <div className="field">Praise from admin<input name="praise_admin" type="number" defaultValue={praise.admin} /></div>
        </div>
      </div>
      <Switch name="visible" label="Employees see their own score and flags" sub="Transparency (decided 24 Oct). Turn off to hide My score." defaultOn={visible} />
      <div className="actions"><button className="btn primary" type="submit">Save rules</button></div>
    </ActionForm>
  );
}

export function TeamView({ people, cs, rules, praise, visible, lateCount, initial }: { people: PersonVM[]; cs: CsVM[]; rules: Rule[]; praise: { cs: number; admin: number }; visible: boolean; lateCount: number; initial: string | null }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const L = useLookups();
  const [sel, setSel] = useState<string | null>(initial);
  const allOpen = useMemo(() => people.flatMap((p) => p.open), [people]);
  const openTask = useLiveDrawer(allOpen, (t) => <TaskDrawer t={t} />, "task");
  const depts = [...new Set(people.map((p) => p.dept))].filter(Boolean);
  const rows = people.filter((p) => f === "All" || (f === "Flagged" ? p.flags.length : p.dept === f));
  const p = people.find((x) => x.id === sel) ?? rows[0] ?? people[0];
  const avg = people.length ? Math.round(people.reduce((s, x) => s + x.score, 0) / people.length) : 0;
  const lowest = p ? [...p.breakdown].filter((b) => b.weight).sort((a, b) => (100 - b.value) * b.weight - (100 - a.value) * a.weight)[0] : null;

  return (
    <section className="view on">
      <PageHead eyebrow="Team" title={<>Who&apos;s <em>roasting</em> well.</>} sub="One score per person, built from what the system already knows. Flags from CS and admin move it up or down."
        actions={<>
          <button className="btn primary" onClick={() => open(<UserForm />)}><PlusIcon />Add team member</button>
          {L.me.role === "admin" ? <button className="btn" onClick={() => open(<RulesDrawer rules={rules} praise={praise} visible={visible} />)}>Scoring rules</button> : null}
          <button className="btn" onClick={() => open(<FlagForm />)}>Raise a flag</button>
        </>} />
      <Stats items={[[people.length, "People scored"], [avg, "Average score", "gold"], [people.filter((x) => x.flags.some((fl) => fl.pts > 0)).length, "Praised"], [people.filter((x) => x.flags.some((fl) => fl.pts < 0)).length, "Red flagged", "hot"], [lateCount, "Late tasks", "hot"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={[["All", people.length], ...depts.map((d) => [d, people.filter((x) => x.dept === d).length] as [string, number]), ["Flagged", people.filter((x) => x.flags.length).length]]} /></div>
      {rows.length ? (() => {
        // Who has room this week: open tasks per person, with what's due in the next 7 days and what's already late.
        const d = new Date(); const todayKey = new Date(d.getTime() + (d.getTimezoneOffset() + 330) * 60000).toISOString().slice(0, 10);
        const weekEnd = new Date(new Date(todayKey + "T00:00:00Z").getTime() + 7 * 864e5).toISOString().slice(0, 10);
        const load = rows.map((x) => ({ p: x, open: x.open.length, week: x.open.filter((t) => t.dueKey >= todayKey && t.dueKey < weekEnd).length, late: x.open.filter((t) => t.isLate).length })).sort((a, b) => b.open - a.open || b.late - a.late);
        const max = Math.max(1, ...load.map((l) => l.open));
        const free = load.filter((l) => l.open <= 1);
        return (
          <section className="card">
            <div className="card-h"><div><div className="eyebrow">Workload · next 7 days</div><h2>Who has <em>room.</em></h2></div>
              <span className="muted small">{free.length ? `${free.map((l) => l.p.name.split(" ")[0]).join(", ")} ${free.length === 1 ? "is" : "are"} lightest — assign there first.` : "Everyone has 2+ tasks on their desk."}</span></div>
            <div className="wl">
              {load.map((l) => (
                <button key={l.p.id} type="button" className={l.p.id === p?.id ? "on" : ""} onClick={() => setSel(l.p.id)} title={`${l.p.name}: ${l.open} open`}>
                  <b>{l.p.name}</b>
                  <span className="bar"><i className={l.open ? "" : "free"} style={{ width: `${Math.round((l.open / max) * 100)}%` }} /></span>
                  <small><span>{l.open} open</span><span>· {l.week} due this week</span>{l.late ? <span className="hot">· {l.late} late</span> : null}</small>
                </button>
              ))}
            </div>
          </section>
        );
      })() : null}
      <div className="split">
        <div className="scroll">
          <table className="tbl fit"><thead><tr><th>#</th><th>Person</th><th className="r">Tasks</th><th className="r">On time</th><th className="r">Review pass</th><th className="r">CS rating</th><th className="r">EOD</th><th className="r">Attendance</th><th>Flags</th><th className="r">Score</th></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.id} className={x.id === p?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
                <td className="big" style={{ color: "var(--faint)" }}>{people.indexOf(x) + 1}</td>
                <td className="n">{x.name}<small>{x.dept}</small></td>
                <td className="r">{x.tasks}</td><td className="r">{x.ontime}%</td><td className="r">{x.pass}%</td><td className="r">{x.cs}</td><td className="r">{x.eod}%</td><td className="r">{x.att}%</td>
                <td>{x.flags.length ? x.flags.map((fl, i) => <Flag key={i} c={fl.c} style={{ margin: "0 3px 0 0" }} />) : "—"}</td>
                <td className="r"><Mini v={x.score} /><b className="big">{x.score}</b></td>
              </tr>
            ))}</tbody></table>
        </div>
        {p ? (
          <div className="card">
            <div className="card-h"><div><div className="eyebrow">{p.dept}{p.rank ? ` · #${p.rank} in dept` : ""}</div><h2>{p.name}</h2></div>
              <b className="num" style={{ fontFamily: "Fraunces,Georgia,serif", fontSize: 44, fontWeight: 300 }}>{p.score}</b></div>
            <div className="team">{p.breakdown.map((q) => (
              <div key={q.key} className="member" style={{ gridTemplateColumns: "minmax(0,1fr) 90px 44px" }}>
                <div className="n" style={{ fontSize: 12 }}>{q.label}<span>weight {q.weight} · {q.raw}</span></div>
                <div className="bar"><i style={{ width: `${Math.round(q.value)}%` }} /></div><b className="s num" style={{ fontSize: 16 }}>{Math.round(q.value)}</b>
              </div>
            ))}</div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              Flags {p.flagPts >= 0 ? "+" : ""}{p.flagPts} (capped ±15){p.last !== null ? ` · last month ${p.last}` : ""}{lowest ? ` · biggest lift: ${lowest.label.toLowerCase()}` : ""}
            </p>
            <div><h4 className="eyebrow" style={{ marginBottom: 8 }}>Flags this month</h4>
              {p.flags.length ? <div className="tl">{p.flags.map((fl, i) => <div key={i} className={fl.pts < 0 ? "red" : ""}>{fl.type} · {fl.subject}<small>{fl.by} · {fl.on} · {fl.pts > 0 ? "+" : ""}{fl.pts}</small></div>)}</div>
                : <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No flags. Steady pour.</p>}</div>
            <div><h4 className="eyebrow" style={{ marginBottom: 8 }}>On their desk · {p.open.length}</h4>
              <div className="list">{p.open.length ? p.open.map((t) => (
                <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "9px 0", cursor: "pointer" }} onClick={() => openTask(t)}>
                  <div className="t" style={{ fontSize: 13 }}>{t.name}<span>{t.brand} · due {t.due}</span></div><div className="r"><StatusPill s={t.status} /></div>
                </div>)) : <div className="empty">Free hands.</div>}</div></div>
            <div className="actions"><button className="btn" onClick={() => open(<FlagForm personId={p.id} />)}>Raise a flag</button></div>
          </div>
        ) : null}
      </div>
      <section className="card">
        <div className="card-h"><div><div className="eyebrow">Client servicing team</div><h2>Who&apos;s <em>holding</em> the cups.</h2></div><button className="btn" onClick={() => open(<FlagForm cs />)}>Flag a CS</button></div>
        <div className="scroll"><table className="tbl fit"><thead><tr><th>Person</th><th>Brands</th><th className="r">Open tasks</th><th className="r">Late</th><th className="r">Unanswered requests</th><th className="r">Avg client rating</th><th>Flags</th><th className="r">Score</th></tr></thead>
          <tbody>{cs.map((c) => (
            <tr key={c.id} style={{ cursor: "default" }}>
              <td className="n">{c.name}<small>{c.desig}</small></td>
              <td>{c.brands.length ? c.brands.map((b) => <span className="tag" key={b} style={{ marginRight: 4 }}>{b}</span>) : "—"}</td>
              <td className="r">{c.open}</td><td className="r" style={c.late ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{c.late}</td>
              <td className="r">{c.unanswered}</td><td className="r">{c.rating}</td>
              <td>{c.flags.length ? c.flags.map((fl, i) => <span key={i} title={fl.subject}><Flag c={fl.c} style={{ margin: "0 3px 0 0" }} /></span>) : "—"}</td>
              <td className="r">{c.score ?? "—"}</td>
            </tr>
          ))}</tbody></table></div>
      </section>
    </section>
  );
}

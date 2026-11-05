"use client";
import { useMemo, useState } from "react";
import { Chips, Search, useLiveDrawer, useUi } from "../kit";
import { useLookups } from "../lookups";
import { PageHead, PlusIcon, Stats, Who } from "../ui";
import { ProjectForm, TaskForm } from "./forms";
import { PriPill, ProjectDrawer, StatusPill, TaskDrawer, type ProjectVM } from "./task-drawer";
import type { ProjectRowVM, TaskVM } from "@/lib/views";

const host = (u: string) => u.replace(/^https?:\/\//, "").split("/")[0];

export function TaskCard({ t, onOpen }: { t: TaskVM; onOpen: () => void }) {
  const link = t.attachments[0];
  return (
    <div className="tcard" onClick={onOpen}>
      <div className="b">{t.brand}</div>
      <div className="t">{t.name}</div>
      <div className={`f${t.isLate ? " late" : ""}`}><span>{t.isLate ? t.late : t.due}</span>{t.assignees[0] ? <Who n={t.assignees[0].name} /> : null}</div>
      <div className="f" style={{ fontSize: 10 }}>
        {link ? <span>{link.kind === "link" ? `🔗 ${host(link.url)}` : `🖼 ${t.attachments.length} file${t.attachments.length > 1 ? "s" : ""}`}</span> : <span style={{ color: "var(--faint)" }}>nothing shared yet</span>}
        <span>{t.code}</span>
      </div>
    </div>
  );
}

export function TasksView({ tasks, projects, doneLabel, doneThisMonth, initialTask, initialFilter, initialProject, cs }: {
  tasks: TaskVM[]; projects: ProjectRowVM[]; doneLabel: string; doneThisMonth: number; initialTask: string | null; initialFilter: string; initialProject: string | null;
  /** CS mode (Team portal): copy for their brands + "Flag assignee" in the drawer. */ cs?: boolean;
}) {
  const L = useLookups();
  const { open } = useUi();
  const [mode, setMode] = useState<"board" | "list" | "projects">("board");
  const [f, setF] = useState(initialFilter);
  const [q, setQ] = useState("");
  const openTask = useLiveDrawer(tasks, (t) => <TaskDrawer t={t} flag={cs} />, "task", initialTask);
  const openProject = useLiveDrawer(projects, (p) => <ProjectDrawer p={p as ProjectVM} />, "project", initialProject);

  const filters: Record<string, (t: TaskVM) => boolean> = {
    All: () => true, Overdue: (t) => t.isLate, "Due today": (t) => t.dueToday && !t.status.isDone,
    "Awaiting client": (t) => t.status.isClientGate, "Nothing shared yet": (t) => !t.attachments.length && !t.status.isDone,
  };
  const rows = useMemo(() => tasks.filter((t) => {
    if (!(filters[f] ?? filters.All)(t)) return false;
    const s = q.toLowerCase();
    return !s || `${t.name} ${t.brand} ${t.project} ${t.assignees.map((a) => a.name).join(" ")} ${t.cs.name} ${t.code}`.toLowerCase().includes(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tasks, f, q]);
  const projRows = projects.filter((p) => !q || `${p.name} ${p.brand} ${p.type} ${p.brandPoc}`.toLowerCase().includes(q.toLowerCase()));
  const open_ = tasks.filter((t) => !t.status.isDone);

  return (
    <section className="view on">
      <PageHead eyebrow={cs ? "Tasks · your brands" : "Projects & Tasks"} title={<>What&apos;s <em>brewing.</em></>} sub={cs ? "Every task on the brands you look after. Review, move, nudge, or flag from the card." : "Every task, its real deadline, who's on it, and where it sits. Click a card to see its full story."}
        actions={<>
          <Chips value={mode} onChange={(m) => setMode(m as typeof mode)} items={[["board", null, "Board"], ["list", null, "List"], ["projects", null, "Projects"]]} />
          <button className="btn" onClick={() => open(<ProjectForm />)}>New project</button>
          <button className="btn primary" onClick={() => open(<TaskForm />)}><PlusIcon />New task</button>
        </>} />
      <Stats items={[[open_.length, "Open"], [tasks.filter(filters.Overdue).length, "Overdue", "hot"], [tasks.filter(filters["Due today"]).length, "Due today"], [tasks.filter(filters["Awaiting client"]).length, "Awaiting client"], [doneThisMonth, doneLabel, "gold"]]} />
      <div className="bar">
        <Chips value={f} onChange={setF} items={Object.keys(filters).map((k) => [k, tasks.filter(filters[k]).length])} />
        <Search value={q} onChange={setQ} placeholder="Search task, brand, person" />
      </div>
      {mode === "board" ? (
        <div className="board">
          {L.statuses.map((s) => {
            const ts = rows.filter((t) => t.status.id === s.id);
            return (
              <div key={s.id} className={`col${s.isRejected ? " hot" : s.isDone ? " done" : ""}`}>
                <h3>{s.name}<b>{ts.length}</b></h3>
                {ts.length ? ts.map((t) => <TaskCard key={t.id} t={t} onOpen={() => openTask(t)} />) : <div className="empty" style={{ padding: 14 }}>—</div>}
              </div>
            );
          })}
        </div>
      ) : mode === "list" ? (
        <div className="scroll"><table className="tbl"><thead><tr><th>Task</th><th>Brand · Project</th><th>Assignee</th><th>CS</th><th>Due (IST)</th><th>Status</th><th>Link</th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id} onClick={() => openTask(t)}>
              <td className="n">{t.name}<small>{t.code}</small></td>
              <td className="n">{t.brand}<small>{t.project}</small></td>
              <td>{t.assignees[0] ? <Who n={t.assignees[0].name} /> : "—"}{t.assignees.length > 1 ? <small style={{ color: "var(--muted)" }}> +{t.assignees.length - 1}</small> : null}</td>
              <td><Who n={t.cs.name} /></td>
              <td style={t.isLate ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{t.due}{t.isLate ? <><br /><small>{t.late}</small></> : null}</td>
              <td><StatusPill s={t.status} /></td>
              <td>{t.attachments.length ? <span className="lnk">🔗 {t.attachments.length}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
            </tr>
          ))}</tbody></table>
          {!rows.length ? <div className="empty">Nothing matches.</div> : null}
        </div>
      ) : (
        <div className="scroll"><table className="tbl"><thead><tr><th>Project</th><th>Brand</th><th>Brand POC</th><th>Start → Deadline</th><th className="r">Tasks</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>{projRows.length ? projRows.map((p) => (
            <tr key={p.id} onClick={() => openProject(p)}>
              <td className="n">{p.name}<small>{p.code}{p.type ? ` · ${p.type}` : ""}{p.subType ? ` · ${p.subType}` : ""}</small></td>
              <td>{p.brand}</td><td>{p.brandPoc || "—"}</td>
              <td style={{ color: "var(--muted)" }}>{p.start} → <b style={{ color: "var(--fg)" }}>{p.deadline}</b></td>
              <td className="r">{p.tasks.length} <small style={{ color: "var(--muted)" }}>· {p.done} done</small></td>
              <td><PriPill p={p.priority} label={p.priorityLabel} /></td><td><StatusPill s={p.status} /></td>
            </tr>
          )) : <tr><td colSpan={7} className="empty">No projects match.</td></tr>}</tbody></table></div>
      )}
    </section>
  );
}

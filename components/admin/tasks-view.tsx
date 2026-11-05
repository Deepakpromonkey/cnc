"use client";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, Chips, Search, useLiveDrawer, useUi } from "../kit";
import { useLookups } from "../lookups";
import { PageHead, PlusIcon, Stats, Who } from "../ui";
import { ProjectForm, TaskForm } from "./forms";
import { PriPill, ProjectDrawer, StatusPill, TaskDrawer, type ProjectVM } from "./task-drawer";
import { bulkMoveTasks, bulkNudge, moveTaskAction } from "@/app/actions/tasks";
import { priorityClass } from "@/lib/status";
import type { ProjectRowVM, TaskVM } from "@/lib/views";

const host = (u: string) => u.replace(/^https?:\/\//, "").split("/")[0];
/** How many finished cards the board shows before "Show all". */
const DONE_PREVIEW = 6;

export function TaskCard({ t, onOpen, draggable, onDragStart, onDragEnd, dragging, showStatus }: {
  t: TaskVM; onOpen: () => void; draggable?: boolean; onDragStart?: (e: DragEvent) => void; onDragEnd?: () => void; dragging?: boolean; showStatus?: boolean;
}) {
  const link = t.attachments[0];
  const pri = priorityClass(t.priority);
  return (
    <div className={`tcard${dragging ? " dragging" : ""}`} onClick={onOpen} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} title={draggable ? "Drag to another column to move it" : undefined}>
      {pri !== "dim" ? <i className={`pri ${pri}`} title={`${t.priorityLabel} priority`} /> : null}
      <div className="b" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><span>{t.brand}</span>
        {!t.status.isDone && t.inStatusDays >= 3 ? <span className={`age${t.inStatusDays >= 5 ? " hot" : ""}`} title={`In "${t.status.name}" for ${t.inStatusDays} days`}>{t.inStatusDays}d here</span> : null}</div>
      <div className="t">{t.name}</div>
      {showStatus ? <div className="f"><StatusPill s={t.status} /><span>{t.dueTime ? t.due.split(", ").pop() : ""}</span></div> : null}
      <div className={`f${t.isLate ? " late" : ""}`}><span>{t.isLate ? t.late : t.due}</span>{t.assignees[0] ? <Who n={t.assignees[0].name} /> : null}</div>
      <div className="f" style={{ fontSize: 10 }}>
        {link ? <span>{link.kind === "link" ? `🔗 ${host(link.url)}` : `🖼 ${t.attachments.length} file${t.attachments.length > 1 ? "s" : ""}`}</span> : <span style={{ color: "var(--faint)" }}>nothing shared yet</span>}
        <span>{t.code}</span>
      </div>
    </div>
  );
}

type SortKey = "due" | "name" | "brand" | "assignee" | "status";

/** Today's date key in IST (YYYY-MM-DD), matching TaskVM.dueKey. */
function istTodayKey() {
  const d = new Date();
  return new Date(d.getTime() + (d.getTimezoneOffset() + 330) * 60000).toISOString().slice(0, 10);
}
/** The seven day keys of the week that is `offset` weeks away from this one (Monday first). */
function weekKeys(offset: number) {
  const base = new Date(istTodayKey() + "T00:00:00Z");
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * 864e5 + offset * 7 * 864e5);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 864e5).toISOString().slice(0, 10));
}
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (k: string) => `${Number(k.slice(8, 10))} ${MON[Number(k.slice(5, 7)) - 1]}`;

export function TasksView({ tasks, projects, doneLabel, doneThisMonth, initialTask, initialFilter, initialProject, cs }: {
  tasks: TaskVM[]; projects: ProjectRowVM[]; doneLabel: string; doneThisMonth: number; initialTask: string | null; initialFilter: string; initialProject: string | null;
  /** CS mode (Team portal): copy for their brands + "Flag assignee" in the drawer. */ cs?: boolean;
}) {
  const L = useLookups();
  const { open, toast } = useUi();
  const router = useRouter();
  const [mode, setMode] = useState<"board" | "week" | "list" | "projects">("board");
  const [wk, setWk] = useState(0);
  const [f, setF] = useState(initialFilter);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [person, setPerson] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const [showAllDone, setShowAllDone] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkTo, setBulkTo] = useState("");
  const openTask = useLiveDrawer(tasks, (t) => <TaskDrawer t={t} flag={cs} />, "task", initialTask);
  const openProject = useLiveDrawer(projects, (p) => <ProjectDrawer p={p as ProjectVM} />, "project", initialProject);

  // Keyboard shortcuts (ignored while typing or when a dialog is open): N new task · B/W/L/P views · / search · ? help.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, select, [contenteditable]") || document.querySelector(".pal, .drawer.on, .modal-wrap")) return;
      const key = e.key.toLowerCase();
      if (key === "n") { e.preventDefault(); open(<TaskForm />); }
      else if (key === "b") setMode("board"); else if (key === "w") setMode("week"); else if (key === "l") setMode("list"); else if (key === "p") setMode("projects");
      else if (key === "/") { e.preventDefault(); (document.querySelector(".search input") as HTMLInputElement | null)?.focus(); }
      else if (key === "?") toast("Shortcuts: N new task · B board · W week · L list · P projects · / search · ⌘K jump anywhere");
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, toast]);

  const filters: Record<string, (t: TaskVM) => boolean> = {
    All: () => true, Overdue: (t) => t.isLate, "Due today": (t) => t.dueToday && !t.status.isDone,
    "Awaiting client": (t) => t.status.isClientGate, "Nothing shared yet": (t) => !t.attachments.length && !t.status.isDone,
    "Stuck 3d+": (t) => !t.status.isDone && t.inStatusDays >= 3,
  };
  const brands = useMemo(() => [...new Set(tasks.map((t) => t.brand))].sort(), [tasks]);
  const people = useMemo(() => [...new Set(tasks.flatMap((t) => t.assignees.map((a) => a.name)))].sort(), [tasks]);
  const rows = useMemo(() => tasks.filter((t) => {
    if (!(filters[f] ?? filters.All)(t)) return false;
    if (brand && t.brand !== brand) return false;
    if (person && !t.assignees.some((a) => a.name === person)) return false;
    const s = q.toLowerCase();
    return !s || `${t.name} ${t.brand} ${t.project} ${t.assignees.map((a) => a.name).join(" ")} ${t.cs.name} ${t.code}`.toLowerCase().includes(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tasks, f, q, brand, person]);
  const sorted = useMemo(() => {
    const order = new Map(L.statuses.map((s, i) => [s.id, i]));
    const key = (t: TaskVM) => sort.key === "due" ? t.dueKey : sort.key === "name" ? t.name.toLowerCase() : sort.key === "brand" ? t.brand.toLowerCase() : sort.key === "assignee" ? (t.assignees[0]?.name ?? "").toLowerCase() : String(order.get(t.status.id) ?? 99).padStart(2, "0");
    return [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [rows, sort, L.statuses]);
  const projRows = projects.filter((p) => !q || `${p.name} ${p.brand} ${p.type} ${p.brandPoc}`.toLowerCase().includes(q.toLowerCase()));
  const open_ = tasks.filter((t) => !t.status.isDone);
  const filtering = f !== "All" || !!q || !!brand || !!person;

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`sortable${right ? " r" : ""}${sort.key === k ? " on" : ""}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {children}{sort.key === k ? <span className="arrow">{sort.dir === 1 ? "↑" : "↓"}</span> : null}
    </th>
  );

  /** Drop a dragged card on a column: same rules as the "Move to" select in the drawer. */
  const drop = async (statusId: string) => {
    const id = dragId; setDragId(null); setOverCol(null);
    if (!id) return;
    const t = tasks.find((x) => x.id === id); const target = L.statuses.find((s) => s.id === statusId);
    if (!t || !target || t.status.id === statusId) return;
    let note = "";
    if (target.isRejected) {
      const n = window.prompt(`Rejecting "${t.name}" — one consolidated note for the assignees (required):`);
      if (!n?.trim()) return;
      note = n.trim();
    }
    const fd = new FormData(); fd.set("id", id); fd.set("statusId", statusId); if (note) fd.set("note", note);
    const r = await moveTaskAction(fd);
    toast(r.ok ? (r.message ?? `Moved to ${target.name}`) : r.error);
    if (r.ok) router.refresh();
  };

  return (
    <section className="view on">
      <PageHead eyebrow={cs ? "Tasks · your brands" : "Projects & Tasks"} title={<>What&apos;s <em>brewing.</em></>} sub={cs ? "Every task on the brands you look after. Review, move, nudge, or flag from the card." : "Every task, its real deadline, who's on it, and where it sits. Click a card for its full story, or drag it to another column to move it."}
        actions={<>
          <Chips value={mode} onChange={(m) => setMode(m as typeof mode)} items={[["board", null, "Board"], ["week", null, "Week"], ["list", null, "List"], ["projects", null, "Projects"]]} />
          <button className="btn" onClick={() => open(<ProjectForm />)}>New project</button>
          <button className="btn primary" onClick={() => open(<TaskForm />)}><PlusIcon />New task</button>
        </>} />
      <Stats items={[[open_.length, "Open"], [tasks.filter(filters.Overdue).length, "Overdue", "hot"], [tasks.filter(filters["Due today"]).length, "Due today"], [tasks.filter(filters["Awaiting client"]).length, "Awaiting client"], [doneThisMonth, doneLabel, "gold"]]} />
      <div className="bar">
        <Chips value={f} onChange={setF} items={Object.keys(filters).map((k) => [k, tasks.filter(filters[k]).length])} />
        {mode !== "projects" ? <>
          <select className="flt" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Filter by brand"><option value="">All brands</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
          <select className="flt" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by assignee"><option value="">Anyone</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
          {filtering ? <button className="chip" onClick={() => { setF("All"); setQ(""); setBrand(""); setPerson(""); }}>Clear ×</button> : null}
        </> : null}
        <Search value={q} onChange={setQ} placeholder="Search task, brand, person" />
      </div>
      {mode === "board" ? (
        <div className="board" style={{ "--cols": L.statuses.length } as React.CSSProperties}>
          {L.statuses.map((s) => {
            const all = sorted.filter((t) => t.status.id === s.id);
            const hidden = s.isDone && !showAllDone && !filtering ? Math.max(0, all.length - DONE_PREVIEW) : 0;
            const ts = hidden ? all.slice(0, DONE_PREVIEW) : all;
            return (
              <div key={s.id} className={`col${s.isRejected ? " hot" : s.isDone ? " done" : ""}${overCol === s.id && dragId ? " over" : ""}`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overCol !== s.id) setOverCol(s.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); void drop(s.id); }}>
                <h3><span>{s.name}</span><b>{all.length}</b></h3>
                <div className="cards">
                  {ts.length ? ts.map((t) => <TaskCard key={t.id} t={t} onOpen={() => openTask(t)} draggable dragging={dragId === t.id}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setDragId(t.id); }} onDragEnd={() => { setDragId(null); setOverCol(null); }} />)
                    : <div className="empty" style={{ padding: 14 }}>{dragId ? "Drop here" : "—"}</div>}
                  {hidden ? <button type="button" className="more" onClick={() => setShowAllDone(true)}>Show all {all.length} · {hidden} more</button> : null}
                  {s.isDone && showAllDone && all.length > DONE_PREVIEW ? <button type="button" className="more" onClick={() => setShowAllDone(false)}>Show fewer</button> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : mode === "week" ? (() => {
        const keys = weekKeys(wk); const today = istTodayKey();
        const before = sorted.filter((t) => !t.status.isDone && t.dueKey < keys[0]).length;
        const after = sorted.filter((t) => !t.status.isDone && t.dueKey > keys[6]).length;
        const inWeek = sorted.filter((t) => t.dueKey >= keys[0] && t.dueKey <= keys[6]);
        return (
          <>
            <div className="week-h">
              <button type="button" className="ibtn" title="Previous week" onClick={() => setWk(wk - 1)}>‹</button>
              <b>{wk === 0 ? "This week" : wk === 1 ? "Next week" : wk === -1 ? "Last week" : `Week of ${dayLabel(keys[0])}`}</b>
              <span className="muted small">{dayLabel(keys[0])} – {dayLabel(keys[6])} · {inWeek.length} task{inWeek.length === 1 ? "" : "s"} due</span>
              <button type="button" className="ibtn" title="Next week" onClick={() => setWk(wk + 1)}>›</button>
              {wk !== 0 ? <button type="button" className="chip" onClick={() => setWk(0)}>Back to this week</button> : null}
              <span className="muted small" style={{ marginLeft: "auto" }}>{before ? <>{before} open before this week · </> : null}{after ? <>{after} due later</> : null}</span>
            </div>
            <div className="board week">
              {keys.map((k, i) => {
                const ts = inWeek.filter((t) => t.dueKey === k);
                const late = ts.filter((t) => t.isLate).length;
                return (
                  <div key={k} className={`col${k === today ? " today" : k < today ? " past" : ""}`}>
                    <h3><span>{DOW[i]}<small>{dayLabel(k)}{k === today ? " · today" : ""}</small></span><b>{ts.length}</b></h3>
                    <div className="cards">
                      {ts.length ? ts.map((t) => <TaskCard key={t.id} t={t} showStatus onOpen={() => openTask(t)} />) : <div className="empty" style={{ padding: 14 }}>{i >= 5 ? "weekend" : "—"}</div>}
                      {late ? <div className="muted small" style={{ textAlign: "center" }}>{late} running late</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })() : mode === "list" ? (
        <div className="scroll"><table className="tbl"><thead><tr>
          <th className="ck"><input type="checkbox" aria-label="Select all" checked={!!sorted.length && picked.length === sorted.length} onChange={(e) => setPicked(e.target.checked ? sorted.map((t) => t.id) : [])} /></th>
          <Th k="name">Task</Th><Th k="brand">Brand · Project</Th><Th k="assignee">Assignee</Th><th>CS</th><Th k="due">Due (IST)</Th><Th k="status">Status</Th><th>Link</th></tr></thead>
          <tbody>{sorted.map((t) => (
            <tr key={t.id} onClick={() => openTask(t)} className={picked.includes(t.id) ? "sel" : ""}>
              <td className="ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${t.name}`} checked={picked.includes(t.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, t.id] : picked.filter((x) => x !== t.id))} /></td>
              <td className="n">{t.name}<small>{t.code}{t.priority !== "normal" ? ` · ${t.priorityLabel}` : ""}{!t.status.isDone && t.inStatusDays >= 3 ? ` · ${t.inStatusDays}d in ${t.status.name.toLowerCase()}` : ""}</small></td>
              <td className="n">{t.brand}<small>{t.project}</small></td>
              <td>{t.assignees[0] ? <Who n={t.assignees[0].name} /> : "—"}{t.assignees.length > 1 ? <small style={{ color: "var(--muted)" }}> +{t.assignees.length - 1}</small> : null}</td>
              <td><Who n={t.cs.name} /></td>
              <td className="nowrap" style={t.isLate ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{t.due}{t.isLate ? <><br /><small>{t.late}</small></> : null}</td>
              <td><StatusPill s={t.status} /></td>
              <td>{t.attachments.length ? <span className="lnk">🔗 {t.attachments.length}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
            </tr>
          ))}</tbody></table>
          {!sorted.length ? <div className="empty">Nothing matches.</div> : null}
          {picked.length ? (
            <div className="bulk">
              <span>{picked.length} selected</span>
              <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} aria-label="Move selected to"><option value="">Move to…</option>{L.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <ActionButton action={bulkMoveTasks} values={{ statusId: bulkTo, ...Object.fromEntries(picked.map((id, i) => [`ids_${i}`, id])) }} disabled={!bulkTo}
                confirm={L.statuses.find((s) => s.id === bulkTo)?.isRejected ? undefined : `Move ${picked.length} task${picked.length === 1 ? "" : "s"}?`}>Move</ActionButton>
              <ActionButton action={bulkNudge} values={Object.fromEntries(picked.map((id, i) => [`ids_${i}`, id]))} confirm={`Ask Sarthi to nudge people on ${picked.length} task${picked.length === 1 ? "" : "s"}?`}>Nudge via Sarthi</ActionButton>
              <button type="button" className="x" onClick={() => setPicked([])}>Clear ×</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="scroll"><table className="tbl"><thead><tr><th>Project</th><th>Brand</th><th>Brand POC</th><th>Start → Deadline</th><th className="r">Tasks</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>{projRows.length ? projRows.map((p) => (
            <tr key={p.id} onClick={() => openProject(p)}>
              <td className="n">{p.name}<small>{p.code}{p.type ? ` · ${p.type}` : ""}{p.subType ? ` · ${p.subType}` : ""}</small></td>
              <td>{p.brand}</td><td>{p.brandPoc || "—"}</td>
              <td className="nowrap" style={{ color: "var(--muted)" }}>{p.start} → <b style={{ color: "var(--fg)" }}>{p.deadline}</b></td>
              <td className="r">{p.tasks.length} <small style={{ color: "var(--muted)" }}>· {p.done} done</small></td>
              <td><PriPill p={p.priority} label={p.priorityLabel} /></td><td><StatusPill s={p.status} /></td>
            </tr>
          )) : <tr><td colSpan={7} className="empty">No projects match.</td></tr>}</tbody></table></div>
      )}
    </section>
  );
}

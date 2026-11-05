"use client";
import { useState } from "react";
import { ActionButton, ActionForm, MentionInput, StarInput, UploadMany, useUi } from "../kit";
import { useLookups } from "../lookups";
import { Ext, Field, Pill, Stars, Who } from "../ui";
import { FlagForm, TaskForm, ProjectForm, type ProjectInit } from "./forms";
import { addDeliverables, commentProject, commentTask, completeProject, moveTaskAction, nudgeAssignee, rateTaskCs, remindClient } from "@/app/actions/tasks";
import { priorityClass } from "@/lib/status";
import type { TaskVM } from "@/lib/views";

export function StatusPill({ s }: { s: { name: string; cls: string } }) {
  return <Pill cls={s.cls}>{s.name}</Pill>;
}
export function PriPill({ p, label }: { p: string; label: string }) {
  return <Pill cls={priorityClass(p)}>{label}</Pill>;
}

function Attachments({ list }: { list: TaskVM["attachments"] }) {
  const imgs = list.filter((a) => a.kind === "upload");
  const links = list.filter((a) => a.kind === "link");
  if (!list.length) return <span style={{ color: "var(--faint)", fontSize: 13 }}>Nothing shared yet</span>;
  return (
    <>
      {imgs.length ? <div className="thumbs">{imgs.map((a) => <a key={a.id} className="th" href={a.url} target="_blank" rel="noopener"><img src={a.thumb ?? a.url} alt="" /><span>{a.label}</span></a>)}</div> : null}
      {links.length ? <div className="bar" style={{ gap: 6 }}>{links.map((a) => <Ext key={a.id} href={a.url}>{a.label}</Ext>)}</div> : null}
    </>
  );
}

function Comments({ list, action, id, placeholder }: { list: { who: string; when: string; body: string }[]; action: (fd: FormData) => Promise<import("@/lib/result").Result>; id: string; placeholder: string }) {
  const L = useLookups();
  const people = [...L.cs, ...L.employees].map((p) => ({ id: p.id, name: p.name }));
  return (
    <div>
      <h4 className="eyebrow" style={{ marginBottom: 8 }}>Comments · {list.length}</h4>
      {list.length ? <div className="chat">{list.map((c, i) => <div key={i} className="bubble q" style={{ maxWidth: "100%" }}><small>{c.who} · {c.when}</small>{c.body}</div>)}</div>
        : <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>No comments yet.</p>}
      <ActionForm action={action} keepOpen resetOnSuccess className="">
        <input type="hidden" name="id" value={id} />
        <div className="ask" style={{ marginTop: 10, borderRadius: 14 }}><MentionInput placeholder={placeholder} people={people} /><button type="submit">Post</button></div>
      </ActionForm>
    </div>
  );
}

export function TaskDrawer({ t, flag }: { t: TaskVM; flag?: boolean }) {
  const L = useLookups();
  const { open } = useUi();
  const [to, setTo] = useState(t.status.id);
  const target = L.statuses.find((s) => s.id === to);
  const needsNote = !!target?.isRejected;
  return (
    <>
      <div className="eyebrow">{t.code} · {t.brand} · {t.project}</div>
      <h2>{t.name}</h2>
      <div className="bar">
        <StatusPill s={t.status} /><PriPill p={t.priority} label={t.priorityLabel} />
        <span className="tag">{t.title}</span>{t.serv ? <span className="tag">{t.serv}</span> : null}
        {t.isLate ? <Pill cls="brand">{t.late}</Pill> : null}
        {t.requestCode ? <span className="tag">from {t.requestCode}</span> : null}
        {!t.share ? <span className="tag">internal only</span> : null}
      </div>
      {t.desc ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{t.desc}</p> : null}
      <div className="pgrid">
        <div className="pf wide"><span>Assigned to</span><div className="bar" style={{ marginTop: 4, gap: 10 }}>{t.assignees.map((a) => <Who key={a.id} n={a.name} sub={a.dept} />)}</div></div>
        <Field label="CS"><Who n={t.cs.name} /></Field>
        <Field label="Created by"><Who n={t.by} /></Field>
        <Field label="Start" value={t.start} />
        <Field label="Deadline (IST)" value={t.due} />
      </div>

      <div>
        <h4>Deliverables & updates</h4>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}><Attachments list={t.attachments} /></div>
        <ActionForm action={addDeliverables} keepOpen className="" resetOnSuccess>
          <input type="hidden" name="id" value={t.id} />
          <div style={{ marginTop: 10 }}><UploadMany name="files" hint="Creatives, exports, screenshots · images upload here" linkName="link" /></div>
          <button className="btn" type="submit" style={{ marginTop: 8 }}>Add to task</button>
        </ActionForm>
      </div>

      <ActionForm action={moveTaskAction} keepOpen className="">
        <input type="hidden" name="id" value={t.id} />
        <h4>Move to</h4>
        <select name="statusId" style={{ marginTop: 8 }} value={to} onChange={(e) => setTo(e.target.value)}>
          {L.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {to !== t.status.id ? (
          <>
            <textarea name="note" style={{ marginTop: 8 }} placeholder={needsNote ? "One consolidated note — required, goes to the assignees" : "Note (optional)"} required={needsNote} />
            <button className="btn primary" type="submit" style={{ marginTop: 8 }}>Move to {target?.name}</button>
          </>
        ) : null}
      </ActionForm>

      {t.status.isClientGate ? (
        <div>
          <h4>Client approval</h4>
          <p style={{ margin: "6px 0 10px", fontSize: 13, color: "var(--muted)" }}>Shared on the client portal {t.gateSince}. They can approve, or reject with a note.</p>
          <div className="appr">
            <ActionButton action={remindClient} values={{ id: t.id }}>Remind client (Sarthi)</ActionButton>
            <ActionButton action={moveTaskAction} values={{ id: t.id, statusId: L.statuses.find((s) => s.isDone)!.id, note: "Approved by client (marked manually)" }} confirm="Mark approved on the client's behalf?" keepOpen={false}>Mark approved manually</ActionButton>
          </div>
        </div>
      ) : null}

      {t.clientRating ? (
        <div><h4>Client rating</h4>
          <div style={{ marginTop: 6, fontSize: 18 }}><Stars n={t.clientRating.stars} /> <small style={{ color: "var(--muted)", fontSize: 12 }}>{t.clientRating.on}</small></div>
          {t.clientRating.review ? <p style={{ margin: "4px 0 0", fontSize: 13, fontStyle: "italic" }}>“{t.clientRating.review}”</p> : null}</div>
      ) : t.status.isDone ? <div><h4>Client rating</h4><p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>Not rated yet · Sarthi asks the client 24 h after completion.</p></div> : null}

      {t.status.isDone || t.status.isReview || t.status.isClientGate ? (
        <ActionForm action={rateTaskCs} keepOpen className="">
          <input type="hidden" name="id" value={t.id} />
          <h4>CS rating (feeds the score)</h4>
          <div className="bar" style={{ marginTop: 8, gap: 10 }}><StarInput name="stars" initial={t.csRating ?? 0} /><button className="btn" type="submit">Save rating</button></div>
        </ActionForm>
      ) : null}

      <div><h4>Timeline</h4>
        <div className="tl" style={{ marginTop: 10 }}>{[...t.history].reverse().map((h, i) => <div key={i} className={h.red ? "red" : ""}>{h.text}<small>{h.when} · {h.by}</small></div>)}</div></div>
      <div><h4>EOD log</h4>
        {t.eod.length ? <div className="tl" style={{ marginTop: 10 }}>{t.eod.map((e, i) => <div key={i}>{e.when} · {e.text}<small>{e.by}</small></div>)}</div>
          : <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>Nothing logged yet. Sarthi chases at 7:30 pm.</p>}</div>
      <Comments list={t.comments} action={commentTask} id={t.id} placeholder="Comment · @ to mention" />
      <div className="actions">
        <button className="btn primary" onClick={() => open(<TaskForm task={t} />)}>Edit task</button>
        <button className="btn" onClick={() => open(<TaskForm task={t} duplicate />)} title="Same brand, project, people and brief — new name and deadline">Duplicate</button>
        <a className="btn" href={`/api/tasks/${t.id}/ics`} download title="Download a calendar event for the deadline">Add to calendar</a>
        <ActionButton action={nudgeAssignee} values={{ id: t.id }}>Ask Sarthi to nudge {t.assignees[0]?.name.split(" ")[0]}</ActionButton>
        {flag && t.assignees[0] ? <button className="btn" onClick={() => open(<FlagForm personId={t.assignees[0].id} employeesOnly />)}>Flag assignee</button> : null}
      </div>
    </>
  );
}

export type ProjectVM = ProjectInit & {
  id: string; code: string; brand: string; status: { name: string; cls: string }; priorityLabel: string; start: string; deadline: string;
  scopeNames: string[]; refLinks: string[]; tasks: TaskVM[]; comments: { who: string; when: string; body: string }[]; done: number;
};

export function ProjectDrawer({ p }: { p: ProjectVM }) {
  const { open } = useUi();
  return (
    <>
      <div className="eyebrow">{p.code} · {p.brand}</div>
      <h2>{p.name}</h2>
      <div className="bar"><StatusPill s={p.status} /><PriPill p={p.priority ?? "normal"} label={p.priorityLabel} /></div>
      <div className="pgrid">
        <Field label="Project type" value={p.type} /><Field label="Sub type" value={p.subType} />
        <Field label="Brand POC" value={p.brandPoc} /><Field label="POC phone" value={p.pocPhone} />
        <Field label="Start date" value={p.start} /><Field label="Deadline" value={p.deadline} />
        <Field label="Payment terms" value={p.terms} />
        <div className="pf"><span>Scope</span><div className="tags" style={{ marginTop: 4 }}>{p.scopeNames.map((s) => <span className="tag" key={s}>{s}</span>)}</div></div>
        <Field label="Description" value={p.description} wide />
        <div className="pf wide"><span>Reference links</span><div className="bar" style={{ marginTop: 4, gap: 6 }}>{p.refLinks.length ? p.refLinks.map((r) => <Ext key={r} href={r} />) : <i style={{ color: "var(--faint)", fontStyle: "normal" }}>—</i>}</div></div>
      </div>
      <div><h4>Tasks · {p.tasks.length}</h4>
        <div className="list" style={{ marginTop: 8 }}>
          {p.tasks.length ? p.tasks.map((t) => (
            <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "9px 0", cursor: "pointer" }} onClick={() => open(<TaskDrawer t={t} />)}>
              <div className="t" style={{ fontSize: 13 }}>{t.name}<span>{t.assignees.map((a) => a.name).join(", ")} · due {t.due}</span></div>
              <div className="r"><StatusPill s={t.status} /></div>
            </div>
          )) : <div className="empty">No tasks yet.</div>}
        </div></div>
      <Comments list={p.comments} action={commentProject} id={p.id} placeholder="Comment as admin" />
      <div className="actions">
        <button className="btn primary" onClick={() => open(<TaskForm brandId={p.brandId} projectId={p.id} />)}>Add task</button>
        <button className="btn" onClick={() => open(<ProjectForm p={p} />)}>Edit project</button>
        <ActionButton action={completeProject} values={{ id: p.id }} confirm="Mark this project completed?">Mark completed</ActionButton>
      </div>
    </>
  );
}

"use client";
// The employee's own task drawer and the EOD form (spec §8 My tasks, §6.3, §6.4).
import { ActionButton, ActionForm, MentionInput, UploadMany, useUi } from "../kit";
import { useLookups } from "../lookups";
import { Ext, Field, Pill, Who } from "../ui";
import { PriPill, StatusPill } from "../admin/task-drawer";
import { addDeliverables, commentTask, moveTaskAction } from "@/app/actions/tasks";
import { pauseTask, saveEod } from "@/app/actions/team";
import type { StatusVM, TaskVM } from "@/lib/views";

/** What an employee may move a task to next (§6.3). */
export function nextMoves(s: StatusVM, all: StatusVM[]): StatusVM[] {
  const plain = all.find((x) => !x.isStart && !x.isDone && !x.isReview && !x.isClientGate && !x.isRejected);
  const review = all.find((x) => x.isReview);
  if (s.isStart) return plain ? [plain] : [];
  if (s.isReview || s.isClientGate || s.isDone) return [];
  return review ? [review] : [];
}

const TA: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--line-strong)", borderRadius: 12, color: "var(--fg)", font: "inherit", padding: "10px 12px", minHeight: 60 };

export function MyTaskDrawer({ t, eod }: { t: TaskVM; eod?: string }) {
  const L = useLookups();
  const { open } = useUi();
  const next = nextMoves(t.status, L.statuses);
  const rejection = [...t.history].reverse().find((h) => h.red);
  const others = t.assignees.filter((a) => a.id !== t.assignees.find((x) => x.id)?.id);
  const imgs = t.attachments.filter((a) => a.kind === "upload");
  const links = t.attachments.filter((a) => a.kind === "link");
  const label = (s: StatusVM) => (s.isReview ? (t.status.isRejected ? "Resubmit for review" : "Submit for review") : `Start · move to ${s.name}`);
  return (
    <>
      <div className="eyebrow">{t.code} · {t.brand} · {t.project}</div>
      <h2>{t.name}</h2>
      <div className="bar"><StatusPill s={t.status} /><PriPill p={t.priority} label={t.priorityLabel} /><span className="tag">{t.title}</span>{t.isLate ? <Pill cls="brand">{t.late}</Pill> : null}</div>
      {t.status.isRejected && rejection ? (
        <div className="appcard" style={{ borderColor: "var(--brand-ink)" }}>
          <h4 style={{ color: "var(--brand-ink)" }}>Sent back · {rejection.when} · {rejection.by}</h4>
          <p style={{ margin: 0, fontSize: 14 }}>{rejection.text.replace(/^[^·]*· /, "").replace(/^“|”$/g, "")}</p>
        </div>
      ) : null}
      {t.desc ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{t.desc}</p> : null}
      <div className="pgrid">
        <Field label="Deadline (IST)" value={t.due} />
        <Field label="Start" value={t.start} />
        <Field label="CS"><Who n={t.cs.name} /></Field>
        <Field label="With you">{others.length ? <div className="bar" style={{ gap: 8 }}>{t.assignees.map((a) => <Who key={a.id} n={a.name} />)}</div> : "Just you"}</Field>
      </div>
      <div>
        <h4>Brief, references & shared work</h4>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {imgs.length ? <div className="thumbs">{imgs.map((a) => <a key={a.id} className="th" href={a.url} target="_blank" rel="noopener"><img src={a.thumb ?? a.url} alt="" /><span>{a.label}</span></a>)}</div> : null}
          {links.length ? <div className="bar" style={{ gap: 6 }}>{links.map((a) => <Ext key={a.id} href={a.url}>{a.label}</Ext>)}</div> : null}
          {!t.attachments.length ? <span className="faint small">Nothing yet.</span> : null}
        </div>
      </div>
      {!t.status.isDone ? (
        <ActionForm action={addDeliverables} keepOpen resetOnSuccess className="">
          <input type="hidden" name="id" value={t.id} />
          <h4>Share my work</h4>
          <div style={{ marginTop: 8 }}><UploadMany name="files" hint="Exports, screenshots · images upload here, up to 10 MB each" linkName="link" /></div>
          <button className="btn" type="submit" style={{ marginTop: 8 }}>Add to task</button>
        </ActionForm>
      ) : null}
      {next.length ? (
        <div className="actions">
          {next.map((s) => (
            <ActionButton key={s.id} action={moveTaskAction} values={{ id: t.id, statusId: s.id }} className="btn primary">{label(s)}</ActionButton>
          ))}
          {!t.status.isStart ? <button className="btn" onClick={() => open(<PauseForm id={t.id} name={t.name} />)}>Pause</button> : null}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>{t.status.isReview ? "With your CS for review. You'll hear back here and on WhatsApp." : t.status.isClientGate ? "With the client for approval." : "Done — nice pour."}</p>
      )}
      {!t.status.isDone ? (
        <ActionForm action={saveEod} keepOpen className="">
          <input type="hidden" name="taskId" value={t.id} />
          <h4>Today&apos;s EOD line</h4>
          <div className="ask" style={{ marginTop: 8, borderRadius: 14 }}><input name={`remark_${t.id}`} defaultValue={eod ?? ""} placeholder="What moved today on this task" /><button type="submit">Save</button></div>
        </ActionForm>
      ) : null}
      <div><h4>Timeline</h4>
        <div className="tl" style={{ marginTop: 10 }}>{[...t.history].reverse().map((h, i) => <div key={i} className={h.red ? "red" : ""}>{h.text}<small>{h.when} · {h.by}</small></div>)}</div></div>
      <div>
        <h4 className="eyebrow" style={{ marginBottom: 8 }}>Comments · {t.comments.length}</h4>
        {t.comments.length ? <div className="chat">{t.comments.map((c, i) => <div key={i} className="bubble q" style={{ maxWidth: "100%" }}><small>{c.who} · {c.when}</small>{c.body}</div>)}</div> : <p className="muted small" style={{ margin: "0 0 8px" }}>No comments yet.</p>}
        <ActionForm action={commentTask} keepOpen resetOnSuccess className="">
          <input type="hidden" name="id" value={t.id} />
          <div className="ask" style={{ marginTop: 10, borderRadius: 14 }}><MentionInput placeholder="Comment · @ to mention" people={[...L.cs, ...L.employees].map((p) => ({ id: p.id, name: p.name }))} /><button type="submit">Post</button></div>
        </ActionForm>
      </div>
      <div className="actions"><a className="btn" href={`/api/tasks/${t.id}/ics`} download title="Download a calendar event for the deadline">Add deadline to my calendar</a></div>
    </>
  );
}

function PauseForm({ id, name }: { id: string; name: string }) {
  const { close } = useUi();
  return (
    <ActionForm action={pauseTask} className="dform">
      <div className="eyebrow">Pause</div>
      <h2>{name}</h2>
      <input type="hidden" name="id" value={id} />
      <div className="form"><div className="field">Why are you pausing?<textarea name="note" style={TA} placeholder="Waiting on copy from Ankit, client assets missing…" /></div>
        <p className="muted small" style={{ margin: 0 }}>The task stays in its column; your CS gets this note. The deadline doesn&apos;t move.</p></div>
      <div className="actions"><button className="btn primary" type="submit">Pause & tell CS</button><button className="btn" type="button" onClick={close}>Cancel</button></div>
    </ActionForm>
  );
}

/** One line per active task + optional status move (§6.4). Used on Today and the EOD log. */
export function EodForm({ tasks, eod, compact }: { tasks: TaskVM[]; eod: Record<string, string>; compact?: boolean }) {
  const L = useLookups();
  const active = tasks.filter((t) => !t.status.isDone);
  if (!active.length) return <div className="empty">No active tasks — nothing to log today.</div>;
  return (
    <ActionForm action={saveEod} keepOpen className="dform">
      <div className="list">
        {active.map((t) => {
          const next = nextMoves(t.status, L.statuses);
          return (
            <div key={t.id} className="item" style={{ gridTemplateColumns: compact ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1.4fr) 150px", alignItems: "start", gap: 10 }}>
              <input type="hidden" name="taskId" value={t.id} />
              <div className="t" style={{ fontSize: 13 }}>{t.name}<span>{t.brand} · {t.status.name}{t.isLate ? <> · <b style={{ color: "var(--brand-ink)" }}>{t.late}</b></> : null}</span></div>
              <input name={`remark_${t.id}`} defaultValue={eod[t.id] ?? ""} placeholder="What moved today" style={{ ...TA, minHeight: 0, padding: "9px 12px" }} />
              <select name={`status_${t.id}`} defaultValue={t.status.id} style={{ ...TA, minHeight: 0, padding: "9px 10px" }}>
                <option value={t.status.id}>{t.status.name}</option>
                {next.map((s) => <option key={s.id} value={s.id}>→ {s.name}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      <div className="actions"><button className="btn primary" type="submit">Save EOD</button><span className="muted small">Sarthi chases at 7:30 pm if a line is missing.</span></div>
    </ActionForm>
  );
}

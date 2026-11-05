"use client";
import { useRef } from "react";
import { ActionForm, StarInput, useUi } from "../kit";
import { Ext, Field, Pill, Stars, Who } from "../ui";
import { decidePiece, ratePiece } from "@/app/actions/client";
import { CLIENT_STEPS } from "@/lib/status";
import type { FileVM, PieceVM } from "@/lib/client-views";
import { RequestForm } from "./forms";

export function StepBar({ step }: { step: number }) {
  return (
    <div className="steps" title={CLIENT_STEPS.join(" · ")}>
      {[1, 2, 3, 4, 5].map((k) => <div key={k} className={k <= step ? (k === 4 && step === 4 ? "hot" : "on") : ""} />)}
    </div>
  );
}

export const CPill = ({ t }: { t: Pick<PieceVM, "label" | "cls"> }) => <Pill cls={t.cls}>{t.label}</Pill>;

/** Thumbnails for image uploads, link chips for heavy files. */
export function Previews({ files, fill }: { files: FileVM[]; fill?: boolean }) {
  const imgs = files.filter((f) => f.kind === "upload");
  const links = files.filter((f) => f.kind === "link");
  return (
    <>
      <div className="prev">
        {imgs.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noopener"><img src={f.thumb ?? f.url} alt={f.label} /></a>)}
        {links.map((f) => <div key={f.id}>{f.label}</div>)}
        {fill && files.length < 3 ? Array.from({ length: 3 - Math.max(files.length, 1) }).map((_, i) => <div key={`p${i}`}>Preview</div>) : null}
      </div>
      {links.length ? <div className="bar" style={{ gap: 6 }}>{links.map((f) => <Ext key={f.id} href={f.url}>{f.label}</Ext>)}</div> : null}
    </>
  );
}

/** Approve / send back. Send back is blocked without a note (C2). */
export function Decide({ id, title = "Your call" }: { id: string; title?: string }) {
  const note = useRef<HTMLTextAreaElement>(null);
  const { toast } = useUi();
  return (
    <ActionForm action={decidePiece} className="">
      <input type="hidden" name="id" value={id} />
      {title ? <h4>{title}</h4> : null}
      <textarea ref={note} name="note" placeholder="Optional note — one message reaches the designer directly" />
      <div className="appr" style={{ marginTop: 10 }}>
        <button className="btn primary" type="submit" name="decision" value="approve">Approve</button>
        <button className="btn" type="submit" name="decision" value="reject" style={{ color: "var(--brand-ink)" }}
          onClick={(e) => { if (!note.current?.value.trim()) { e.preventDefault(); toast("Add a note so the designer knows what to change"); note.current?.focus(); } }}>Send back with note</button>
      </div>
    </ActionForm>
  );
}

export function PieceDrawer({ t, projects }: { t: PieceVM; projects: { id: string; name: string }[] }) {
  const { open } = useUi();
  return (
    <>
      <div className="eyebrow">{t.project} · {t.title}</div>
      <h2>{t.name}</h2>
      <div className="bar"><CPill t={t} /></div>
      <StepBar step={t.step} />
      <div className="legend">{CLIENT_STEPS.map((s) => <span key={s}>{s}</span>)}</div>
      {t.desc ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{t.desc}</p> : null}
      <div className="pgrid">
        <Field label={t.done ? "Delivered" : "Expected"} value={t.done ? t.doneOn : t.due} />
        <Field label="Your CS"><Who n={t.cs} /></Field>
      </div>
      {t.files.length ? <div><h4>Files</h4><div className="appcard" style={{ marginTop: 8, padding: 12 }}><Previews files={t.files} /></div></div> : null}
      {t.gate ? <div className="appcard"><Decide id={t.id} /></div> : null}
      {t.done ? (
        <div>
          <h4>Rate this piece</h4>
          {t.rating ? (
            <>
              <div style={{ marginTop: 6, fontSize: 20 }}><Stars n={t.rating.stars} /> <small style={{ color: "var(--muted)", fontSize: 12 }}>{t.rating.on}</small></div>
              {t.rating.review ? <p style={{ margin: "4px 0 0", fontSize: 13, fontStyle: "italic" }}>“{t.rating.review}”</p> : null}
            </>
          ) : (
            <ActionForm action={ratePiece} keepOpen className="">
              <input type="hidden" name="id" value={t.id} />
              <div className="rate" style={{ marginTop: 6 }}><StarInput name="stars" /></div>
              <textarea name="review" style={{ marginTop: 8 }} placeholder="A line for the team (optional)" />
              <div className="actions" style={{ marginTop: 8 }}><button className="btn primary" type="submit">Submit rating</button></div>
            </ActionForm>
          )}
        </div>
      ) : null}
      <div>
        <h4>Story so far</h4>
        <div className="tl" style={{ marginTop: 10 }}>{[...t.story].reverse().map((h, i) => <div key={i}>{h.text}<small>{h.when}</small></div>)}</div>
      </div>
      {t.comments.length ? (
        <div><h4 className="eyebrow" style={{ marginBottom: 8 }}>Notes from the studio · {t.comments.length}</h4>
          <div className="chat">{t.comments.map((c, i) => <div key={i} className="bubble q" style={{ maxWidth: "100%" }}><small>{c.who} · {c.when}</small>{c.body}</div>)}</div></div>
      ) : null}
      <div className="actions">
        <button className="btn" onClick={() => open(<RequestForm projects={projects} projectId={t.projectId} title={`Change on: ${t.name}`} />)}>Request a change</button>
      </div>
    </>
  );
}

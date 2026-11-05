"use client";
import { useEffect, useState } from "react";
import { ActionButton, ActionForm, Chips, useUi } from "../kit";
import { useLookups } from "../lookups";
import { Ext, Field, LinkOrDash, PageHead, Pill, PlusIcon, Stats, Who } from "../ui";
import { AnnouncementForm, ConcernForm, InvoiceForm, OfflinePaymentForm, RequestForm, TaskForm } from "./forms";
import { PriPill } from "./task-drawer";
import { answerRequest, archiveAnnouncement, reassignConcern, replyConcern, setConcernStatus } from "@/app/actions/ops";
import { remindInvoice, sendInvoiceAction, voidInvoice } from "@/app/actions/money";
import { CONCERN_CLASS, CONCERN_LABEL, INVOICE_CLASS, INVOICE_LABEL, REQUEST_CLASS, REQUEST_LABEL } from "@/lib/status";

const TA: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--line-strong)", borderRadius: 12, color: "var(--fg)", font: "inherit", padding: "10px 12px", minHeight: 70 };

// ================= CONCERNS =================
export type ConcernVM = {
  id: string; code: string; subject: string; details: string; by: string; byId: string; cat: string; when: string; owner: string; ownerId: string; status: string; confidential: boolean;
  sla: number; overdue: boolean; closed: string; file: string | null; onBehalf: boolean; thread: { who: string; when: string; body: string; mine: boolean }[]; monthly: boolean; resolveHrs: number | null;
};

export function ConcernsView({ rows, initial }: { rows: ConcernVM[]; initial: string | null }) {
  const L = useLookups();
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [sel, setSel] = useState(initial);
  const list = rows.filter((c) => f === "All" || CONCERN_LABEL[c.status] === f);
  const c = rows.find((x) => x.id === sel) ?? list[0] ?? rows[0];
  const resolved = rows.filter((x) => x.resolveHrs !== null);
  const avg = resolved.length ? resolved.reduce((s, x) => s + x.resolveHrs!, 0) / resolved.length / 24 : 0;
  const top = Object.entries(rows.reduce<Record<string, number>>((m, x) => ({ ...m, [x.cat]: (m[x.cat] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return (
    <section className="view on">
      <PageHead eyebrow="Concerns" title={<>What the team <em>needs to say.</em></>} sub="Raised by employees from their portal, seen only by admin and HR. Every one gets an owner, a reply and a close date. Nothing sits silent."
        actions={<button className="btn" onClick={() => open(<ConcernForm />)}><PlusIcon />Log a concern</button>} />
      <Stats items={[[rows.filter((x) => x.status === "open").length, "Open · no reply yet", "hot"], [rows.filter((x) => x.status === "in_discussion").length, "In discussion"], [resolved.length ? `${avg.toFixed(1)} d` : "—", "Avg time to resolve", "gold"], [rows.filter((x) => x.monthly).length, "Raised this month"], [top, "Top category"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={[["All", rows.length], ["Open", rows.filter((x) => x.status === "open").length], ["In discussion", rows.filter((x) => x.status === "in_discussion").length], ["Resolved", rows.filter((x) => x.status === "resolved").length]]} /></div>
      <div className="split">
        <div className="scroll"><table className="tbl"><thead><tr><th>Concern</th><th>Raised by</th><th>Category</th><th>Raised</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>{list.length ? list.map((x) => (
            <tr key={x.id} className={x.id === c?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
              <td className="n">{x.subject}<small>{x.code}{x.confidential ? " · confidential" : ""}{x.overdue ? " · SLA missed" : ""}</small></td>
              <td><Who n={x.by} /></td><td><span className="tag">{x.cat}</span></td><td style={{ color: "var(--muted)" }}>{x.when}</td><td><Who n={x.owner} /></td>
              <td><Pill cls={CONCERN_CLASS[x.status]}>{CONCERN_LABEL[x.status]}</Pill></td>
            </tr>)) : <tr><td colSpan={6} className="empty">Nothing here. Good sign.</td></tr>}</tbody></table></div>
        {c ? (
          <div className="card">
            <div className="card-h"><div><div className="eyebrow">{c.code} · {c.cat}{c.confidential ? " · confidential" : ""}</div><h2>{c.subject}</h2></div><Pill cls={CONCERN_CLASS[c.status]}>{CONCERN_LABEL[c.status]}</Pill></div>
            <div className="bubble q" style={{ maxWidth: "100%" }}><small>{c.by} · {c.when}{c.onBehalf ? " · logged on their behalf" : ""}</small>{c.details}</div>
            {c.file ? <a href={c.file} target="_blank" rel="noopener" className="thumbs"><span className="th"><img src={c.file} alt="" /><span>screenshot</span></span></a> : null}
            {c.thread.map((m, i) => <div key={i} className={`bubble ${m.mine ? "q" : "a"}`} style={{ maxWidth: "100%" }}><small>{m.who} · {m.when}</small>{m.body}</div>)}
            <div className="kv">
              <span>Owner</span><b><Who n={c.owner} /></b>
              <span>Visible to</span><b>{c.confidential ? "Admin + owner only · hidden from CS" : "Admin, HR and the person's CS lead"}</b>
              {c.closed ? <><span>Closed</span><b>{c.closed} · {c.thread.length} replies</b></> : <><span>SLA</span><b>Reply within {c.sla} h · {c.status === "open" ? <span style={{ color: "var(--brand-ink)", fontWeight: 700 }}>{c.overdue ? "overdue, no reply" : "no reply yet"}</span> : "on track"}</b></>}
            </div>
            {c.status !== "resolved" ? (
              <>
                <ActionForm action={replyConcern} keepOpen resetOnSuccess className="dform">
                  <input type="hidden" name="id" value={c.id} />
                  <div><h4 className="eyebrow" style={{ marginBottom: 8 }}>Reply to {c.by.split(" ")[0]}</h4><textarea name="body" style={TA} placeholder="They see this in their portal and on WhatsApp" required /></div>
                  <div className="actions"><button className="btn primary" type="submit">Reply</button>
                    <ActionButton action={setConcernStatus} values={{ id: c.id, status: "resolved" }}>Mark resolved</ActionButton></div>
                </ActionForm>
                <ActionForm action={reassignConcern} keepOpen className="">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="bar"><select name="ownerUserId" defaultValue={c.ownerId} style={{ ...TA, minHeight: 0, width: "auto", padding: "8px 10px" }}>{[...L.admins, ...L.cs].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn" type="submit">Reassign</button></div>
                </ActionForm>
              </>
            ) : <div className="actions"><ActionButton action={setConcernStatus} values={{ id: c.id, status: "in_discussion" }}>Reopen</ActionButton></div>}
          </div>
        ) : <div className="card"><div className="empty">No concerns logged.</div></div>}
      </div>
    </section>
  );
}

// ================= ANNOUNCEMENTS =================
export type AnnVM = { id: string; code: string; type: string; subject: string; message: string; day: string; mon: string; date: string; dateKey: string; clients: boolean; broadcast: boolean; by: string; on: string; image: string | null; upcoming: boolean };

export function AnnounceView({ rows, nextHoliday }: { rows: AnnVM[]; nextHoliday: string }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [sel, setSel] = useState<string | null>(null);
  const list = rows.filter((a) => f === "All" || (f === "Announcements" ? a.type === "announcement" : f === "Holidays" ? a.type === "holiday" : a.clients));
  const a = rows.find((x) => x.id === sel) ?? list[0] ?? rows[0];
  return (
    <section className="view on">
      <PageHead eyebrow="Announcements & holidays" title={<>Pinned to the <em>noticeboard.</em></>} sub={`Announcements go to the whole team; tick "show to clients" and they land on client portals too. Holidays feed the attendance calendar and Sarthi's reminders.`}
        actions={<><button className="btn" onClick={() => open(<AnnouncementForm holiday />)}>Add holiday</button><button className="btn primary" onClick={() => open(<AnnouncementForm />)}><PlusIcon />New announcement</button></>} />
      <Stats items={[[rows.filter((x) => x.type === "announcement").length, "Announcements"], [rows.filter((x) => x.type === "holiday").length, "Holidays", "gold"], [nextHoliday, "Next holiday"], [rows.filter((x) => x.clients).length, "Visible to clients"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={[["All", rows.length], ["Announcements", rows.filter((x) => x.type === "announcement").length], ["Holidays", rows.filter((x) => x.type === "holiday").length], ["Shown to clients", rows.filter((x) => x.clients).length]]} /></div>
      <div className="split">
        <div className="list">{list.length ? list.map((x) => (
          <div key={x.id} className="item" onClick={() => setSel(x.id)} style={{ gridTemplateColumns: "64px minmax(0,1fr) auto", cursor: "pointer", background: x.id === a?.id ? "var(--brand-soft)" : "transparent", borderRadius: 14, padding: 12 }}>
            <div className="late" style={{ color: x.type === "holiday" ? "var(--gold)" : "var(--brand-ink)", fontSize: 22 }}>{x.day}<small>{x.mon}</small></div>
            <div className="t">{x.subject}<span>{x.type === "holiday" ? "Holiday · office closed" : "Announcement"} · by {x.by}{x.clients ? <> · <b>visible to clients</b></> : null}</span></div>
            <div className="r">{x.type === "holiday" ? <Pill cls="gold">Holiday</Pill> : <Pill cls="brand">Notice</Pill>}</div>
          </div>)) : <div className="empty">Nothing pinned.</div>}</div>
        {a ? (
          <div className="card">
            <div className="card-h"><div><div className="eyebrow">{a.code} · {a.type === "holiday" ? "Holiday" : "Announcement"}</div><h2>{a.subject}</h2></div></div>
            {a.image ? <img src={a.image} alt="" style={{ width: "100%", borderRadius: 14 }} /> : null}
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{a.message}</p>
            <div className="kv"><span>Date</span><b>{a.date}</b><span>Posted by</span><b>{a.by} · {a.on}</b><span>Audience</span><b>{a.clients ? "Team + all client portals" : "Team only"}</b>
              <span>Sarthi</span><b>{a.type === "holiday" ? "Pauses digests and nudges that day" : a.broadcast ? "Sent as a WhatsApp broadcast at posting" : "No broadcast"}</b></div>
            <div className="actions">
              <button className="btn" onClick={() => open(<AnnouncementForm a={{ id: a.id, type: a.type, subject: a.subject, dateKey: a.dateKey, message: a.message, clients: a.clients, broadcast: a.broadcast, image: a.image }} />)}>Edit</button>
              <ActionButton action={archiveAnnouncement} values={{ id: a.id }} style={{ color: "var(--brand-ink)" }} confirm="Archive this notice?">Archive</ActionButton>
            </div>
          </div>
        ) : <div className="card"><div className="empty">Pin the first notice.</div></div>}
      </div>
    </section>
  );
}

// ================= WORK REQUESTS =================
export type ReqVM = {
  id: string; code: string; subject: string; body: string; brand: string; brandId: string; project: string; projectId: string | null; when: string; neededBy: string; poc: string; pocContact: string;
  priority: string; priorityLabel: string; status: string; owner: string; from: string; ref: string | null; task: { id: string; code: string } | null;
  files: { id: string; kind: string; url: string; thumb: string | null; label: string }[]; thread: { who: string; when: string; body: string; client: boolean }[]; replyMins: number | null; monthly: boolean;
};

export function RequestsView({ rows, initial }: { rows: ReqVM[]; initial: string | null }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [sel, setSel] = useState(initial);
  const list = rows.filter((r) => f === "All" || REQUEST_LABEL[r.status] === f);
  const r = rows.find((x) => x.id === sel) ?? list[0] ?? rows[0];
  const replied = rows.filter((x) => x.replyMins !== null && x.monthly);
  const avg = replied.length ? replied.reduce((s, x) => s + x.replyMins!, 0) / replied.length : null;
  const imgs = r?.files.filter((x) => x.kind === "upload") ?? [];
  const links = r?.files.filter((x) => x.kind === "link") ?? [];
  return (
    <section className="view on">
      <PageHead eyebrow="Work requests" title={<>What clients are <em>asking for.</em></>} sub="Requests raised from the client portal. Answer, hold, or turn one into a task with the brief attached."
        actions={<button className="btn" onClick={() => open(<RequestForm />)}><PlusIcon />Log a request</button>} />
      <Stats items={[[rows.filter((x) => x.status === "new").length, "Unanswered", "hot"], [avg === null ? "—" : avg < 90 ? `${Math.round(avg)} min` : `${(avg / 60).toFixed(1)} h`, "Avg first reply · month", "gold"], [rows.filter((x) => x.status === "converted").length, "Became tasks"], [rows.filter((x) => x.monthly).length, "This month"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={["All", "New", "Answered", "On hold", "Converted"].map((k) => [k, k === "All" ? rows.length : rows.filter((x) => REQUEST_LABEL[x.status] === k).length])} /></div>
      <div className="split">
        <div className="scroll"><table className="tbl"><thead><tr><th>Request</th><th>Brand</th><th>Raised</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>{list.length ? list.map((x) => (
            <tr key={x.id} className={x.id === r?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
              <td className="n"><em className="serif" style={{ fontStyle: "italic", fontWeight: 400, fontSize: 15 }}>“{x.subject}”</em><small>{x.code} · {x.project}{x.ref || x.files.length ? " · 🔗 reference" : ""}</small></td>
              <td>{x.brand}</td><td style={{ color: "var(--muted)" }}>{x.when}<br /><small>need by {x.neededBy}</small></td><td><Who n={x.owner} /></td>
              <td><PriPill p={x.priority} label={x.priorityLabel} /> <Pill cls={REQUEST_CLASS[x.status]}>{REQUEST_LABEL[x.status]}</Pill></td>
            </tr>)) : <tr><td colSpan={5} className="empty">Nothing here.</td></tr>}</tbody></table></div>
        {r ? (
          <div className="card" id="reqDetail">
            <div className="card-h"><div><div className="eyebrow">{r.code} · {r.brand}</div><h2 className="serif" style={{ fontStyle: "italic" }}>“{r.subject}”</h2></div><div className="bar"><PriPill p={r.priority} label={r.priorityLabel} /><Pill cls={REQUEST_CLASS[r.status]}>{REQUEST_LABEL[r.status]}</Pill></div></div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{r.body}</p>
            {imgs.length ? <div className="thumbs">{imgs.map((x) => <a key={x.id} className="th" href={x.url} target="_blank" rel="noopener"><img src={x.thumb ?? x.url} alt="" /><span>{x.label}</span></a>)}</div> : null}
            <div className="pgrid">
              <Field label="Project" value={r.project} /><Field label="Raised" value={r.when} /><Field label="Needed by" value={r.neededBy} /><Field label="Priority" value={r.priorityLabel} />
              <Field label="POC" value={r.poc} /><Field label="POC contact" value={r.pocContact} /><Field label="From" value={r.from} /><Field label="Owner"><Who n={r.owner} /></Field>
              <Field label="Reference" wide><div className="bar" style={{ gap: 6 }}>{r.ref ? <LinkOrDash href={r.ref} /> : null}{links.map((x) => <Ext key={x.id} href={x.url}>{x.label}</Ext>)}{!r.ref && !links.length ? "—" : null}</div></Field>
              {r.task ? <Field label="Became task" value={r.task.code} /> : null}
            </div>
            {r.thread.map((m, i) => <div key={i} className={`bubble ${m.client ? "q" : "a"}`} style={{ maxWidth: "100%" }}><small>{m.who} · {m.when}</small>{m.body}</div>)}
            <ActionForm action={answerRequest} keepOpen resetOnSuccess className="dform">
              <input type="hidden" name="id" value={r.id} />
              <div><h4 className="eyebrow" style={{ marginBottom: 8 }}>Reply to client</h4><textarea name="body" style={TA} placeholder="Goes to their portal and WhatsApp" /></div>
              <div className="actions">
                {r.status !== "converted" ? <button type="button" className="btn primary" onClick={() => open(<TaskForm brandId={r.brandId} projectId={r.projectId ?? undefined} title={r.subject} requestId={r.id} link={r.ref ?? undefined} />)}>Convert to task</button> : null}
                <button className="btn" type="submit">Answer</button>
                {r.status !== "converted" ? <button className="btn" type="submit" name="hold" value="1">Put on hold</button> : null}
              </div>
            </ActionForm>
          </div>
        ) : <div className="card"><div className="empty">No requests yet.</div></div>}
      </div>
    </section>
  );
}

// ================= INVOICES =================
export type InvVM = {
  id: string; no: string; brand: string; brandId: string; total: string; totalNum: number; sub: string; gst: string; issued: string; due: string; status: string; late: number; note: string;
  link: string | null; paidOn: string; balance: number; paidSoFar: string; terms: string; items: { d: string; q: number; r: string; a: string }[];
  trail: { text: string; when: string; by: string; red: boolean }[]; reminders: boolean;
};

export function MoneyView({ rows, stats, initial, openNew }: { rows: InvVM[]; stats: { billed: string; collected: string; due: string; overdue: string; month: string; live: boolean }; initial: string | null; openNew: boolean }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [sel, setSel] = useState(initial);
  useEffect(() => { if (openNew) open(<InvoiceForm />); }, [openNew, open]);
  const label = (s: string) => INVOICE_LABEL[s];
  const list = rows.filter((i) => f === "All" || label(i.status) === f);
  const i = rows.find((x) => x.id === sel) ?? list[0] ?? rows[0];
  return (
    <section className="view on">
      <PageHead eyebrow="Invoices & payments" title={<>{stats.month}, <em>on the books.</em></>} sub="Raise it here, the client pays through their portal on Razorpay, the ledger updates itself. Sarthi chases the late ones."
        actions={<button className="btn primary" onClick={() => open(<InvoiceForm />)}><PlusIcon />Raise invoice</button>} />
      <Stats items={[[stats.billed, `On the book · ${stats.month}`], [stats.collected, "Collected", "gold"], [stats.due, "Due"], [stats.overdue, "Overdue", "hot"], [stats.live ? "T+2" : "Test mode", stats.live ? "Razorpay settlement" : "Razorpay · mock checkout"]]} />
      <div className="bar"><Chips value={f} onChange={setF} items={["All", "Overdue", "Due", "Paid", "Draft", "Void"].map((k) => [k, k === "All" ? rows.length : rows.filter((x) => label(x.status) === k).length])} /></div>
      <div className="split">
        <div className="scroll"><table className="tbl"><thead><tr><th>Invoice</th><th>Brand</th><th className="r">Amount</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.id} className={x.id === i?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
              <td className="n">{x.no}<small>{x.note.split(" · ")[0]}</small></td><td>{x.brand}</td><td className="r big">{x.total}</td><td style={{ color: "var(--muted)" }}>{x.issued}</td>
              <td style={x.status === "overdue" ? { color: "var(--brand-ink)", fontWeight: 700 } : undefined}>{x.due}{x.late ? <><br /><small>{x.late} d late</small></> : null}</td>
              <td><Pill cls={INVOICE_CLASS[x.status]}>{label(x.status)}{x.status === "viewed" ? " · viewed" : ""}</Pill></td>
            </tr>))}</tbody></table></div>
        {i ? (
          <div className="card">
            <div className="card-h"><div><div className="eyebrow">{i.no} · {i.brand}</div><h2>{i.total}</h2></div><Pill cls={INVOICE_CLASS[i.status]}>{label(i.status)}</Pill></div>
            <div className="kv"><span>For</span><b>{i.note}</b><span>Subtotal</span><b>{i.sub}</b><span>GST</span><b>{i.gst}</b><span>Issued</span><b>{i.issued}</b><span>Due</span><b>{i.due}{i.terms ? ` · ${i.terms}` : ""}</b>
              {i.paidOn ? <><span>Paid</span><b>{i.paidOn}</b></> : null}
              {i.status !== "paid" && i.paidSoFar !== "₹0" ? <><span>Received</span><b>{i.paidSoFar} · balance ₹{i.balance.toLocaleString("en-IN")}</b></> : null}
              {i.link ? <><span>Pay link</span><b><Ext href={i.link}>{i.link.replace(/^https?:\/\//, "").slice(0, 40)}</Ext></b></> : null}</div>
            <div className="scroll"><table className="tbl" style={{ minWidth: 0 }}><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
              <tbody>{i.items.map((x, k) => <tr key={k} style={{ cursor: "default" }}><td>{x.d}</td><td className="r">{x.q}</td><td className="r">{x.r}</td><td className="r">{x.a}</td></tr>)}</tbody></table></div>
            <div><h4 className="eyebrow" style={{ marginBottom: 8 }}>Trail</h4>
              <div className="tl">{i.trail.map((e, k) => <div key={k} className={e.red ? "red" : ""}>{e.text}<small>{e.when}{e.by ? ` · ${e.by}` : ""}</small></div>)}</div></div>
            <div className="actions">
              {i.status === "draft" ? <ActionButton action={sendInvoiceAction} values={{ id: i.id }} className="btn primary">Send to client</ActionButton> : null}
              {["sent", "viewed", "overdue"].includes(i.status) ? <>
                <ActionButton action={remindInvoice} values={{ id: i.id }} className="btn primary">Remind now (Sarthi)</ActionButton>
                <button className="btn" onClick={() => open(<OfflinePaymentForm id={i.id} label={`${i.no} · ${i.brand}`} balance={String(i.balance)} />)}>Record offline payment</button>
              </> : null}
              {i.status !== "draft" ? <a className="btn" href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener">{i.status === "paid" ? "Download receipt" : "Invoice PDF"}</a> : null}
              {i.status !== "paid" && i.status !== "void" ? <ActionButton action={voidInvoice} values={{ id: i.id }} style={{ color: "var(--brand-ink)" }} confirm={`Void ${i.no}? It stays visible as void.`}>Void</ActionButton> : null}
            </div>
          </div>
        ) : <div className="card"><div className="empty">Raise the first invoice.</div></div>}
      </div>
    </section>
  );
}

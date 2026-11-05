"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, Chips, Switch, useLiveDrawer, useUi } from "../kit";
import { Empty, Field, Ext, PageHead, Pill, Stats, Tags, Who, ini, type Stat } from "../ui";
import { CPill, Decide, PieceDrawer, Previews, StepBar } from "./piece";
import { DetailsForm, PasswordForm, RequestForm, type Me } from "./forms";
import { answerRequest } from "@/app/actions/ops";
import { markInvoiceViewed, setPreference } from "@/app/actions/client";
import type { InvoiceCVM, NoticeVM, PieceVM, ProjectCVM, RequestCVM } from "@/lib/client-views";

type Opt = { id: string; name: string };

function usePieces(list: PieceVM[], projects: Opt[], initial?: string | null) {
  return useLiveDrawer(list, (t) => <PieceDrawer t={t} projects={projects} />, "piece", initial);
}

// ---------------- Home ----------------
export type HomeProps = {
  greet: string; first: string; brand: string; pieces: PieceVM[]; projects: Opt[]; activeProjects: number; openRequests: number;
  due: { id: string; no: string; amount: string; note: string; due: string }[]; dueSum: string; dueOn: string;
  notices: NoticeVM[]; team: { id: string; name: string; desig: string; phone: string; email: string; inSince: string }[]; hours: string; initial?: string | null;
};
export function HomeView(p: HomeProps) {
  const openPiece = usePieces(p.pieces, p.projects, p.initial);
  const appr = p.pieces.filter((t) => t.gate);
  const wip = p.pieces.filter((t) => !t.done && !t.gate);
  const doneMonth = p.pieces.filter((t) => t.doneThisMonth).length;
  const cs = p.team[0];
  const open = p.pieces.filter((t) => !t.done);
  return (
    <section className="view on">
      <section className="hero">
        <div>
          <div className="eyebrow">{p.brand} · Coffee & Creative</div>
          <h1 className="serif" style={{ marginTop: 10 }}>{p.greet}, <em>{p.first}.</em><br />{appr.length ? `${appr.length} piece${appr.length > 1 ? "s" : ""} waiting for your nod.` : "Nothing waiting on you."}</h1>
          <p><b>{wip.length} piece{wip.length === 1 ? "" : "s"}</b> {wip.length === 1 ? "is" : "are"} in the works across <b>{p.activeProjects} project{p.activeProjects === 1 ? "" : "s"}</b>. {p.due.length ? <><b>{p.dueSum}</b> is due on {p.dueOn}.</> : "Your account is clear."}
            {cs ? <> Your CS {cs.name.split(" ")[0]} {cs.inSince ? `is on the floor since ${cs.inSince}.` : "is a WhatsApp away."}</> : null}</p>
        </div>
        <div className="pour" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
          <Link href="/client/approvals" className={`tile${appr.length ? " hot" : ""}`}><div className={`v num${appr.length ? " hot" : ""}`}>{appr.length}</div><div className="l">Your approval</div></Link>
          <Link href="/client/work" className="tile"><div className="v num">{wip.length}</div><div className="l">In the works</div></Link>
          <Link href="/client/work" className="tile"><div className="v num">{doneMonth}</div><div className="l">Done · this month</div></Link>
          <Link href="/client/requests" className="tile"><div className="v num">{p.openRequests}</div><div className="l">Open requests</div></Link>
        </div>
      </section>

      <div className="row r-3-2">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">01 — Your approval</div><h2>Waiting on <em>you.</em></h2></div><Link className="link" href="/client/approvals">All approvals →</Link></div>
          <div className="list">
            {appr.length ? appr.map((t) => (
              <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", cursor: "pointer" }} onClick={() => openPiece(t)}>
                <div className="t">{t.name}<span>{t.project} · shared {t.sharedOn} · {t.files.length} file{t.files.length !== 1 ? "s" : ""}</span></div>
                <div className="r"><span className="btn primary" style={{ padding: "7px 14px" }}>Review →</span></div>
              </div>
            )) : <Empty>Nothing waiting. Enjoy the coffee.</Empty>}
          </div>
        </section>
        <div style={{ display: "grid", gap: 22 }}>
          <section className="card">
            <div className="card-h"><div><div className="eyebrow">Your team at C&C</div><h2>Who to <em>call.</em></h2></div></div>
            {p.team.map((c) => (
              <div className="cs-card" key={c.id}>
                <div className="ava cs" style={{ width: 44, height: 44, fontSize: 13 }}>{ini(c.name)}</div>
                <div><b style={{ fontSize: 14 }}>{c.name}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{c.desig} · <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a> · <a href={`mailto:${c.email}`}>{c.email}</a></div></div>
              </div>
            ))}
            <div className="legend"><span>{p.hours}</span></div>
          </section>
          <section className="card sarthi">
            <div className="card-h"><div><div className="eyebrow">Today&apos;s 9:00 digest</div><h2>On your <em>WhatsApp.</em></h2></div><span className="st gold">Daily</span></div>
            <div className="chat">
              <div className="bubble a" style={{ maxWidth: "100%", justifySelf: "start", borderTopLeftRadius: 6, borderTopRightRadius: 18 }}>
                <small>Sarthi · 9:00 am</small>
                Good morning {p.first}! Coffee & Creative update for {p.brand}:<br />
                {open.length ? open.map((t) => <span key={t.id}>• {t.name} — {t.label.toLowerCase()}{t.gate ? " (your nod needed)" : ""}<br /></span>) : <>Nothing open today.<br /></>}
                Reply here if anything needs a tweak. — Sarthi, for {cs?.name.split(" ")[0] ?? "your CS"}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="row r-1-1">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">02 — In the works</div><h2>What&apos;s <em>brewing.</em></h2></div><Link className="link" href="/client/work">All work →</Link></div>
          <div className="list">
            {wip.length ? wip.map((t) => (
              <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", cursor: "pointer" }} onClick={() => openPiece(t)}>
                <div className="t">{t.name}<span>{t.project} · expected {t.dueDay}</span><StepBar step={t.step} /></div>
                <div className="r"><CPill t={t} /></div>
              </div>
            )) : <Empty>Quiet week.</Empty>}
          </div>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">03 — Account</div><h2>Invoices & <em>notices.</em></h2></div><Link className="link" href="/client/money">Invoices →</Link></div>
          <div className="list">
            {p.due.map((i) => (
              <div key={i.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <div className="t">{i.no} · {i.amount}<span>{i.note} · due {i.due}</span></div>
                <div className="r"><Link className="btn primary" href={`/client/money?inv=${i.id}`} style={{ padding: "7px 14px" }}>Pay</Link></div>
              </div>
            ))}
            {p.notices.slice(0, 2).map((a) => (
              <div key={a.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <div className="t">{a.subject}<span>{a.date}</span></div>
                <div className="r">{a.holiday ? <Pill cls="gold">Holiday</Pill> : <Pill cls="brand">Notice</Pill>}</div>
              </div>
            ))}
            {!p.due.length && !p.notices.length ? <Empty>All clear.</Empty> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

// ---------------- Approvals ----------------
export function ApprovalsView({ pieces, projects, avgResp, initial }: { pieces: PieceVM[]; projects: Opt[]; avgResp: string; initial?: string | null }) {
  usePieces(pieces, projects, initial);
  const q = pieces.filter((t) => t.gate);
  return (
    <section className="view on">
      <PageHead eyebrow="Approvals" title={<>Your <em>say.</em></>} sub="Approve and the piece is final. Reject with a note and it goes straight back to the designer — one round, one message." />
      <Stats items={[[q.length, "Waiting on you", "hot"], [avgResp, "Your avg response · this month"], [pieces.filter((t) => t.doneThisMonth).length, "Approved · this month", "gold"]]} />
      <div style={{ display: "grid", gap: 14 }}>
        {q.length ? q.map((t) => (
          <div className="appcard" key={t.id}>
            <div className="card-h"><div><div className="eyebrow">{t.project} · shared {t.sharedOn}</div><h2 style={{ fontSize: 22, fontFamily: "Fraunces,Georgia,serif", fontWeight: 300 }}>{t.name}</h2></div><Pill cls="brand">Your approval</Pill></div>
            {t.desc ? <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>{t.desc}</p> : null}
            <Previews files={t.files} fill />
            <Decide id={t.id} title="" />
          </div>
        )) : <Empty>Nothing waiting on you.</Empty>}
      </div>
    </section>
  );
}

// ---------------- Work ----------------
const WORK_CHIPS = ["All", "Your approval", "In the works", "Internal review", "Queued", "Done"];
export function WorkView({ pieces, projects, initial }: { pieces: PieceVM[]; projects: Opt[]; initial?: string | null }) {
  const openPiece = usePieces(pieces, projects, initial);
  const [f, setF] = useState("All");
  const rows = pieces.filter((t) => f === "All" || t.label === f);
  return (
    <section className="view on">
      <PageHead eyebrow="Work" title={<>Every piece, <em>where it is.</em></>} sub="Live from the same board your team works on. Click anything for the story so far." />
      <div className="bar"><Chips items={WORK_CHIPS.map((k) => [k, k === "All" ? pieces.length : pieces.filter((t) => t.label === k).length])} value={f} onChange={setF} /></div>
      <div className="scroll">
        <table className="tbl">
          <thead><tr><th>Piece</th><th>Project</th><th>Status</th><th>Expected</th><th>Shared</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} onClick={() => openPiece(t)}>
                <td className="n">{t.name}<small>{t.title}</small></td>
                <td>{t.project}</td>
                <td><CPill t={t} /><div style={{ marginTop: 6, maxWidth: 160 }}><StepBar step={t.step} /></div></td>
                <td style={{ color: "var(--muted)" }}>{t.done ? `Delivered ${t.doneOn}` : t.dueDay}</td>
                <td>{t.files.length ? <span className="lnk">🔗 {t.files.length}</span> : "—"}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={5}><Empty>Nothing here.</Empty></td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------- Projects ----------------
export function ProjectsView({ list, pieces, projects, since, me }: { list: ProjectCVM[]; pieces: PieceVM[]; projects: Opt[]; since: string; me: Pick<Me, "name" | "phone"> }) {
  const openPiece = usePieces(pieces, projects);
  const { open } = useUi();
  const stats: Stat[] = [[list.filter((p) => !p.finished).length, "Active"], [pieces.filter((t) => !t.done).length, "Pieces in progress"], [pieces.filter((t) => t.doneThisMonth).length, "Delivered · this month", "gold"], [since, "With C&C"]];
  return (
    <section className="view on">
      <PageHead eyebrow="Projects" title={<>Everything <em>we&apos;re on.</em></>} actions={<button className="btn primary" onClick={() => open(<RequestForm projects={projects} me={me} />)}>Request something new</button>} />
      <Stats items={stats} />
      <div className="row r-1-1">
        {list.map((p) => (
          <section className="card" key={p.id}>
            <div className="card-h"><div><div className="eyebrow">{p.eyebrow || "Project"}</div><h2>{p.name}</h2></div><Pill cls={p.cls}>{p.label}</Pill></div>
            {p.desc ? <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>{p.desc}</p> : null}
            <div className="member" style={{ gridTemplateColumns: "minmax(0,1fr) 120px 60px" }}>
              <div className="n" style={{ fontSize: 12 }}>{p.done} of {p.pieces.length} pieces done<span>{p.dates}</span></div>
              <div className="bar"><i style={{ width: `${p.pct}%` }} /></div>
              <b className="s num" style={{ fontSize: 16 }}>{p.pct}%</b>
            </div>
            <div className="list">
              {p.pieces.map((t) => (
                <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "8px 0", cursor: "pointer" }} onClick={() => openPiece(t)}>
                  <div className="t" style={{ fontSize: 13 }}>{t.name}</div><div className="r"><CPill t={t} /></div>
                </div>
              ))}
            </div>
            {p.comment ? <div className="bubble q" style={{ maxWidth: "100%" }}><small>{p.comment.who}</small>{p.comment.body}</div> : null}
          </section>
        ))}
        {!list.length ? <Empty>No projects yet.</Empty> : null}
      </div>
    </section>
  );
}

// ---------------- Requests ----------------
export function RequestsView({ list, projects, me, initial }: { list: RequestCVM[]; projects: Opt[]; me: Pick<Me, "name" | "phone">; initial?: string | null }) {
  const { open } = useUi();
  const [sel, setSel] = useState<string | null>(initial ?? list[0]?.id ?? null);
  const r = list.find((x) => x.id === sel) ?? list[0];
  return (
    <section className="view on">
      <PageHead eyebrow="Requests" title={<>Ask for <em>anything.</em></>} sub="A new creative, a change, a quote. Your CS picks it up, replies here and on WhatsApp, and turns it into work."
        actions={<button className="btn primary" onClick={() => open(<RequestForm projects={projects} me={me} />)}>New request</button>} />
      <div className="split">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Request</th><th>Raised</th><th>Needed by</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={x.id === r?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
                  <td className="n"><em className="serif" style={{ fontStyle: "italic", fontSize: 15 }}>“{x.subject}”</em><small>{x.code} · {x.project}</small></td>
                  <td style={{ color: "var(--muted)" }}>{x.when}</td><td>{x.neededBy}</td><td><Pill cls={x.cls}>{x.statusLabel}</Pill></td>
                </tr>
              ))}
              {!list.length ? <tr><td colSpan={4}><Empty>No requests yet.</Empty></td></tr> : null}
            </tbody>
          </table>
        </div>
        <section className="card">
          {r ? (
            <>
              <div className="card-h"><div><div className="eyebrow">{r.code} · {r.when}</div><h2 className="serif" style={{ fontStyle: "italic" }}>“{r.subject}”</h2></div><Pill cls={r.cls}>{r.statusLabel}</Pill></div>
              {r.body ? <div className="bubble q" style={{ maxWidth: "100%" }}><small>You</small>{r.body}</div> : null}
              {r.replies.map((m, i) => <div key={i} className={`bubble ${m.mine ? "q" : "a"}`} style={{ maxWidth: "100%" }}><small>{m.who} · {m.when}</small>{m.body}</div>)}
              {r.converted ? <p className="small muted" style={{ margin: 0 }}>Converted — this is now work on your board. Follow it under <Link href="/client/work" style={{ color: "var(--gold)", fontWeight: 600 }}>Work</Link>.</p> : null}
              <div className="pgrid">
                <Field label="Project" value={r.project} /><Field label="Needed by" value={r.neededBy} /><Field label="Priority" value={r.priority} />
                <Field label="Handled by"><Who n={r.owner} /></Field>
                {r.ref ? <Field label="Reference" wide><Ext href={r.ref} /></Field> : null}
              </div>
              {r.files.length ? <div className="appcard" style={{ padding: 12 }}><Previews files={r.files} /></div> : null}
              {!r.converted ? (
                <ActionForm action={answerRequest} keepOpen resetOnSuccess className="">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea name="body" placeholder="Add to this request" required />
                  <div className="actions" style={{ marginTop: 8 }}><button className="btn" type="submit">Send</button></div>
                </ActionForm>
              ) : null}
            </>
          ) : <Empty>Raise your first request.</Empty>}
        </section>
      </div>
    </section>
  );
}

// ---------------- Invoices ----------------
export function MoneyView({ list, terms, gst, initial, justPaid }: { list: InvoiceCVM[]; terms: string; gst: string; initial?: string | null; justPaid?: boolean }) {
  const { toast } = useUi();
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(initial ?? list.find((i) => i.open)?.id ?? list[0]?.id ?? null);
  const [method, setMethod] = useState("upi");
  const seen = useRef(new Set<string>());
  const i = list.find((x) => x.id === sel) ?? list[0];
  const open = list.filter((x) => x.open);
  const sum = (xs: InvoiceCVM[]) => "₹" + (xs.reduce((s, x) => s + Number(x.totalPaise), 0) / 100).toLocaleString("en-IN");

  useEffect(() => {
    if (!i || !i.open || i.status !== "sent" && i.status !== "overdue" || seen.current.has(i.id)) return;
    seen.current.add(i.id);
    markInvoiceViewed(i.id).then(() => router.refresh());
  }, [i, router]);
  useEffect(() => { if (justPaid) toast("Paid · receipt sent to your email"); }, [justPaid, toast]);

  return (
    <section className="view on">
      <PageHead eyebrow="Invoices & payments" title={<>Settle up in <em>one tap.</em></>} sub="UPI, card or netbanking through Razorpay. Receipts land here and on your email the moment it clears." />
      <Stats items={[[sum(open), "Due now", open.length ? "hot" : ""], [sum(list.filter((x) => x.status === "paid" && x.paidThisYear)), "Paid · this year", "gold"], [terms || "—", "Terms"], [gst, "Included"]]} />
      <div className="split">
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Invoice</th><th className="r">Amount</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={x.id === i?.id ? "sel" : ""} onClick={() => setSel(x.id)}>
                  <td className="n">{x.no}<small>{x.note}</small></td><td className="r big">{x.amount}</td>
                  <td style={{ color: "var(--muted)" }}>{x.issued}</td><td>{x.due}</td><td><Pill cls={x.cls}>{x.statusLabel}</Pill></td>
                </tr>
              ))}
              {!list.length ? <tr><td colSpan={5}><Empty>No invoices yet.</Empty></td></tr> : null}
            </tbody>
          </table>
        </div>
        <section className="card">
          {i ? (
            <>
              <div className="card-h"><div><div className="eyebrow">{i.no} · {i.issued}</div><h2>{i.amount}</h2></div><Pill cls={i.cls}>{i.statusLabel}</Pill></div>
              <div className="pgrid">
                <Field label="For" value={i.note} wide />
                {i.items.length > 1 ? <div className="pf wide"><span>Items</span>{i.items.map((it, k) => <b key={k} style={{ display: "block" }}>{it.d} · {it.a}</b>)}</div> : null}
                <Field label="Subtotal" value={i.subtotal} /><Field label={`GST ${i.gstRate}%`} value={i.gst} />
                <Field label="Due" value={i.due} />
                {i.partPaid ? <Field label="Paid so far" value={`${i.partPaid} · balance ${i.balance}`} /> : null}
                {i.paidOn ? <Field label="Paid" value={`${i.paidOn} · ${i.method || "Razorpay"}`} wide /> : null}
              </div>
              {i.status === "paid" ? (
                <div className="actions">
                  <a className="btn" href={`/api/invoices/${i.id}/pdf?receipt=1`} target="_blank" rel="noopener">Download receipt</a>
                  <a className="btn" href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener">Invoice PDF</a>
                </div>
              ) : i.open ? (
                <div className="paybox">
                  <h4 className="eyebrow">Pay with</h4>
                  {[["upi", "UPI", "Google Pay, PhonePe, Paytm, any UPI app", "0 fee"], ["card", "Card", "Visa, Mastercard, RuPay, Amex", "2%"], ["netbanking", "Netbanking", "All major banks", "0 fee"]].map(([k, l, s, fee]) => (
                    <label key={k} className={`payopt${method === k ? " on" : ""}`} onClick={() => setMethod(k)}>
                      <input type="radio" name="pm" checked={method === k} onChange={() => setMethod(k)} /><div><b>{l}</b><small>{s}</small></div><span className="tag">{fee}</span>
                    </label>
                  ))}
                  {i.payUrl ? (
                    <a className="btn primary" style={{ justifyContent: "center" }} href={`${i.payUrl}${i.payUrl.includes("?") ? "&" : "?"}method=${method}`} target={i.payUrl.includes("/pay/mock/") ? undefined : "_blank"} rel="noopener">Pay {i.balance || i.amount} via Razorpay</a>
                  ) : <p className="small muted" style={{ margin: 0 }}>Your payment link is being prepared — your CS will share it shortly.</p>}
                  <small style={{ color: "var(--muted)", fontSize: 11, textAlign: "center" }}>Secured by Razorpay · receipt in seconds · C&C never sees your card</small>
                  <a className="linkbtn" style={{ justifySelf: "center" }} href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener">Download invoice PDF</a>
                </div>
              ) : <p className="small muted" style={{ margin: 0 }}>This invoice was voided — nothing to pay.</p>}
            </>
          ) : <Empty>No invoices yet.</Empty>}
        </section>
      </div>
    </section>
  );
}

// ---------------- Your brand ----------------
export type ProfileProps = {
  me: Me; brand: { name: string; company: string; since: string; officialEmail: string; address: string; city: string; state: string; pincode: string; gstin: string; linkedin: string; scope: string[]; engagement: string; logo: string | null };
  csFirst: string; prefs: Record<string, boolean>;
};
const PREFS: [string, string, (email: string) => string][] = [
  ["daily_digest", "Daily WhatsApp digest at 9:00", () => "What moved, what needs you · pause anytime"],
  ["approval_pings", "WhatsApp when something needs your approval", () => "Instant, with the link"],
  ["invoice_emails", "Email copy of every invoice & receipt", (e) => `To ${e}`],
  ["weekly_summary", "Weekly summary on Monday", () => "One message, the whole week"],
  ["sarthi_qa", "Allow Sarthi to answer my status questions", () => "Reply to any digest with a question"],
];
export function ProfileView({ me, brand: b, csFirst, prefs }: ProfileProps) {
  const { open, toast } = useUi();
  const [, start] = useTransition();
  return (
    <section className="view on">
      <PageHead eyebrow="Your brand" title={<>Profile & <em>preferences.</em></>}
        actions={<><button className="btn" onClick={() => open(<PasswordForm />)}>Change password</button><button className="btn primary" onClick={() => open(<DetailsForm me={me} />)}>Edit details</button></>} />
      <div className="split">
        <section className="card">
          <div className="card-h">
            <div className="bar" style={{ gap: 14 }}>
              <div className="blogo" style={{ width: 64, height: 64, fontSize: 18 }}>{b.logo ? <img src={b.logo} alt="" /> : ini(b.name)}</div>
              <div><div className="eyebrow">{b.company}</div><h2>{b.name}</h2></div>
            </div>
            {b.since ? <span className="st gold">Client since {b.since}</span> : null}
          </div>
          <div className="pgrid">
            <Field label="Your name" value={me.name} /><Field label="Login email" value={me.email} />
            <Field label="Phone" value={me.phone} /><Field label="WhatsApp (digests go here)" value={me.whatsapp} />
            <Field label="Official email" value={b.officialEmail} /><Field label="Website">{me.website ? <Ext href={/^https?:/.test(me.website) ? me.website : `https://${me.website}`} /> : null}</Field>
            <Field label="Address" value={b.address} wide /><Field label="City" value={b.city} /><Field label="State" value={b.state} />
            <Field label="Pincode" value={b.pincode} /><Field label="GSTIN" value={b.gstin} />
            <Field label="Instagram" value={me.instagram} /><Field label="LinkedIn" value={b.linkedin} />
            <div className="pf wide"><span>What we do for you</span><Tags items={b.scope} /></div>
            <Field label="Engagement" value={b.engagement} wide />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Company and tax details are edited by your CS — ask {csFirst}.</p>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Preferences</div><h2>How you hear <em>from us.</em></h2></div></div>
          <div className="auto">
            {PREFS.map(([k, l, s]) => (
              <Switch key={k} label={l} sub={s(me.email)} defaultOn={prefs[k] ?? k !== "weekly_summary"} onToggle={(on) => start(async () => {
                const fd = new FormData(); fd.set("key", k); fd.set("value", on ? "on" : "");
                const r = await setPreference(fd); toast(r.ok ? "Saved" : r.error);
              })} />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

// ---------------- Notices ----------------
export function NoticesView({ list }: { list: NoticeVM[] }) {
  return (
    <section className="view on">
      <PageHead eyebrow="Notices & holidays" title={<>From the <em>studio.</em></>} />
      <div className="list">
        {list.map((a) => (
          <section key={a.id} className="card" style={{ marginBottom: 12, gridTemplateColumns: "70px 1fr", display: "grid", gap: 16, alignItems: "start" }}>
            <div className="late" style={{ color: a.holiday ? "var(--gold)" : "var(--brand-ink)", fontSize: 26 }}>{a.day}<small>{a.mon}</small></div>
            <div>
              <div className="bar" style={{ gap: 8, marginBottom: 4 }}>{a.holiday ? <Pill cls="gold">Studio closed</Pill> : <Pill cls="brand">Notice</Pill>}</div>
              <h2 style={{ fontFamily: "Fraunces,Georgia,serif", fontSize: 20, fontWeight: 400 }}>{a.subject}</h2>
              {a.msg ? <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-2)" }}>{a.msg}</p> : null}
              {a.image ? <img src={a.image} alt="" style={{ marginTop: 10, borderRadius: 14, maxHeight: 280 }} /> : null}
            </div>
          </section>
        ))}
        {!list.length ? <Empty>No notices right now.</Empty> : null}
      </div>
    </section>
  );
}

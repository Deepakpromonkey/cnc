"use client";
// Drawer forms — every column of the spec's tables, laid out like the mockup's FORMS2.
import { useMemo, useState } from "react";
import { ActionForm, F, Sec, Sel, Switch, UploadMany, UploadOne, useUi } from "../kit";
import { useLookups } from "../lookups";
import { PROJECT_TYPES, CONCERN_CATEGORIES } from "@/lib/status";
import { saveCompany, saveFlagType, saveListItem, saveStatus, removeStatus, removeFlagType } from "@/app/actions/settings";
import { saveProject, saveTask } from "@/app/actions/tasks";
import { addClientLogin, saveBrand, saveUser } from "@/app/actions/people";
import { logConcern, raiseFlag, raiseRequest, saveAnnouncement } from "@/app/actions/ops";
import { recordOffline, saveInvoice } from "@/app/actions/money";
import type { TaskVM } from "@/lib/views";

const em = (s: string) => <em style={{ color: "var(--brand-ink)" }}>{s}</em>;
const PRI: [string, string][] = [["low", "Low"], ["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"]];
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

function Actions({ primary, extra }: { primary: string; extra?: React.ReactNode }) {
  const { close } = useUi();
  return (
    <div className="actions">
      <button className="btn primary" type="submit">{primary}</button>
      {extra}
      <button className="btn" type="button" onClick={close}>Cancel</button>
    </div>
  );
}

// ---------------- task ----------------
export function TaskForm({ task, brandId, projectId, title, requestId, link }: { task?: TaskVM; brandId?: string; projectId?: string; title?: string; requestId?: string; link?: string }) {
  const L = useLookups();
  const [brand, setBrand] = useState(task?.brandId ?? brandId ?? L.brands[0]?.id ?? "");
  const [proj, setProj] = useState(task?.projectId ?? projectId ?? "");
  const projects = L.projects.filter((p) => p.brandId === brand);
  const brandCs = L.brands.find((b) => b.id === brand)?.cs[0];
  return (
    <ActionForm action={saveTask} className="dform">
      <div className="eyebrow">{task ? `Edit task · ${task.code}` : requestId ? "Convert to task" : "New task"}</div>
      <h2>{task ? task.name : <>Put something {em("on the boil.")}</>}</h2>
      <div className="form">
        {task ? <input type="hidden" name="id" value={task.id} /> : null}
        {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
        <div className="two">
          <F label="Brand"><select name="brandId" value={brand} onChange={(e) => { setBrand(e.target.value); setProj(""); }}>{L.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
          <F label="Project"><select name="projectId" value={proj} onChange={(e) => setProj(e.target.value)} required>
            <option value="">Pick a project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="__new">+ New project…</option></select></F>
        </div>
        {proj === "__new" ? <F label="New project name"><input name="newProject" placeholder="e.g. Social media · Nov" required /></F> : null}
        <div className="two">
          <F label="Task title (type)"><Sel name="titleId" options={L.titles.map((t) => [t.id, t.name])} value={task?.titleId} required /></F>
          <F label="Servicing"><Sel name="servicingTypeId" options={L.servicing.map((t) => [t.id, t.name])} value={task?.servId} placeholder="—" /></F>
        </div>
        <F label="Task name"><input name="name" defaultValue={task?.name ?? title ?? ""} placeholder="What exactly is being made" required /></F>
        <F label="Description"><textarea name="description" defaultValue={task?.desc} placeholder="What good looks like, sizes, references" /></F>
        <Sec>People</Sec>
        <F label="Assignees (multi) · each with their department">
          <Sel name="assignees" multiple options={L.employees.map((p) => [p.id, `${p.name} · ${p.dept}`])} value={task?.assignees.map((a) => a.id) ?? []} />
        </F>
        <div className="two">
          <F label="CS"><Sel key={brand} name="csUserId" options={L.cs.map((p) => [p.id, p.name])} value={task?.cs.id ?? brandCs} required /></F>
          <F label="Priority"><Sel name="priority" options={PRI} value={task?.priority ?? "normal"} /></F>
        </div>
        <Sec>Dates · IST</Sec>
        <div className="two">
          <F label="Start date"><input type="date" name="startDate" defaultValue={task?.startKey || today()} /></F>
          <F label="Deadline date"><input type="date" name="deadlineDate" defaultValue={task?.dueKey} required /></F>
        </div>
        <div className="two">
          <F label="Deadline time"><input type="time" name="deadlineTime" defaultValue={task?.dueTime ?? "18:00"} required /></F>
          <F label="Status"><Sel name="statusId" options={L.statuses.map((s) => [s.id, s.name])} value={task?.status.id ?? L.statuses[0]?.id} /></F>
        </div>
        <Sec>Brief & references</Sec>
        <UploadMany name="files" label="Reference images" hint="Screenshots, mood boards, client samples · JPG, PNG, up to 10 MB each" linkName="link" />
        <F label="Figma / Docs link"><input name="link2" defaultValue={link ?? ""} placeholder="Optional" /></F>
        <Switch name="shareWithClient" label="Share with client on portal" sub="They see status and can approve the deliverable" defaultOn={task?.share ?? true} />
        <Switch name="sarthiNudge" label="Sarthi nudges when late" sub="Every 2 h, copies CS" defaultOn={task?.nudge ?? true} />
      </div>
      <Actions primary={task ? "Save" : requestId ? "Create task from request" : "Create task"} />
    </ActionForm>
  );
}

// ---------------- project ----------------
export type ProjectInit = { id?: string; brandId?: string; name?: string; brandPoc?: string; pocPhone?: string; type?: string; subType?: string; description?: string; startKey?: string; deadlineKey?: string; refs?: string[]; terms?: string; priority?: string; statusId?: string; scopeIds?: string[] };
export function ProjectForm({ p = {} }: { p?: ProjectInit }) {
  const L = useLookups();
  const edit = !!p.id;
  return (
    <ActionForm action={saveProject} className="dform">
      <div className="eyebrow">{edit ? "Edit project" : "New project"}</div>
      <h2>{edit ? p.name : <>Open a {em("project.")}</>}</h2>
      <div className="form">
        {edit ? <input type="hidden" name="id" value={p.id} /> : null}
        <div className="two">
          <F label="Brand"><Sel name="brandId" options={L.brands.map((b) => [b.id, b.name])} value={p.brandId} required /></F>
          <F label="Project name"><input name="name" defaultValue={p.name} required /></F>
        </div>
        <div className="two">
          <F label="Project type"><Sel name="type" options={PROJECT_TYPES} value={p.type} placeholder="—" /></F>
          <F label="Sub type"><input name="subType" defaultValue={p.subType} placeholder="e.g. Monthly calendar, Festive film" /></F>
        </div>
        <F label="Description"><textarea name="description" defaultValue={p.description} /></F>
        <F label="Scope of work (multi)"><Sel name="scope" multiple options={L.scope.map((s) => [s.id, s.name])} value={p.scopeIds ?? []} /></F>
        <div className="two">
          <F label="Brand POC"><input name="brandPoc" defaultValue={p.brandPoc} /></F>
          <F label="POC phone"><input name="pocPhone" defaultValue={p.pocPhone} /></F>
        </div>
        <div className="two">
          <F label="Start date"><input type="date" name="startDate" defaultValue={p.startKey} /></F>
          <F label="Deadline"><input type="date" name="deadline" defaultValue={p.deadlineKey} /></F>
        </div>
        <UploadMany name="files" label="Reference images" hint="Logos, old creatives, inspiration" linkName="link" />
        <F label="Reference link 1"><input name="ref1" defaultValue={p.refs?.[0]} placeholder="Figma / site" /></F>
        <F label="Reference link 2"><input name="ref2" defaultValue={p.refs?.[1]} /></F>
        <F label="Reference link 3"><input name="ref3" defaultValue={p.refs?.[2]} /></F>
        <div className="two">
          <F label="Payment terms"><Sel name="paymentTerms" options={["Monthly retainer", ...L.terms]} value={p.terms} placeholder="—" /></F>
          <F label="Priority"><Sel name="priority" options={PRI} value={p.priority ?? "normal"} /></F>
        </div>
        <F label="Status"><Sel name="statusId" options={L.statuses.map((s) => [s.id, s.name])} value={p.statusId ?? L.statuses[0]?.id} /></F>
      </div>
      <Actions primary={edit ? "Save" : "Create project"} />
    </ActionForm>
  );
}

// ---------------- brand ----------------
export type BrandInit = { id?: string; csIds?: string[]; scopeIds?: string[]; logo?: string | null; fields?: Record<string, string | null | undefined> };
export function BrandForm({ b }: { b?: BrandInit }) {
  const L = useLookups();
  const x = (b?.fields ?? {}) as Record<string, string | undefined>;
  const edit = !!b?.id;
  const fi = (label: string, k: string, ph?: string) => <F label={label}><input name={k} defaultValue={x[k] ?? ""} placeholder={ph} /></F>;
  return (
    <ActionForm action={saveBrand} className="dform">
      <div className="eyebrow">{edit ? "Edit brand" : "Add brand"}</div>
      <h2>{edit ? x.name : <>A new {em("cup.")}</>}</h2>
      <div className="form">
        {edit ? <input type="hidden" name="id" value={b!.id} /> : null}
        <Sec>Identity</Sec>
        <div className="two">{fi("Brand name", "name")}{fi("Company name (legal)", "companyName")}</div>
        <div className="two">{fi("Division", "division", "e.g. Retail, FMCG")}<UploadOne name="logo" label="Brand logo" hint="PNG / SVG / JPG · shows on their portal and invoices" round existing={b?.logo} /></div>
        <Sec>Address</Sec>
        {fi("Address", "address")}
        <div className="two">{fi("City", "city")}{fi("State", "state")}</div>
        <div className="two">{fi("Pincode", "pincode")}<F label="Country"><input name="country" defaultValue={x.country ?? "India"} /></F></div>
        <Sec>Engagement</Sec>
        <div className="two">
          <F label="Frequency"><Sel name="frequency" options={L.frequencies.map((f) => [f.id, f.name])} value={x.frequency ?? "monthly_retainer"} /></F>
          <F label="Payment terms"><input name="paymentTerms" list="termsList" defaultValue={x.paymentTerms ?? ""} /><datalist id="termsList">{L.terms.map((t) => <option key={t} value={t} />)}</datalist></F>
        </div>
        <div className="two">{fi("Client since (year)", "sinceYear", "2024")}{fi("Fee note", "feeNote", "₹1,85,000 / month")}</div>
        <F label="Scope of work (multi)"><Sel name="scope" multiple options={L.scope.map((s) => [s.id, s.name])} value={b?.scopeIds ?? []} /></F>
        <F label="Client servicing (multi · first selected is primary)"><Sel name="cs" multiple options={L.cs.map((s) => [s.id, s.name])} value={b?.csIds ?? []} /></F>
        <Sec>Contact</Sec>
        <div className="two">{fi("Official email", "officialEmail")}{fi("WhatsApp", "whatsapp")}</div>
        <div className="two">{fi("POC name", "pocName")}{fi("POC phone", "pocPhone")}</div>
        <Sec>Portal login</Sec>
        <div className="two">{fi("Login email", "loginEmail", edit ? "Add another login" : "name@brand.com")}
          <F label="Password"><input disabled placeholder={edit ? "Never visible · send a reset link" : "Set by client on first login"} /></F></div>
        <Sec>Online</Sec>
        <div className="two">{fi("Website", "website")}{fi("Instagram", "instagram")}</div>
        <div className="two">{fi("LinkedIn", "linkedin")}{fi("Facebook", "facebook")}</div>
        <div className="two">{fi("Twitter / X", "twitter")}{fi("Other link", "otherSocialLink")}</div>
        <Sec>Tax</Sec>
        <div className="two">{fi("GST", "gstin")}{fi("VAT number", "vatNumber")}</div>
        <F label="Additional information"><textarea name="additionalInformation" defaultValue={x.additionalInformation ?? ""} /></F>
        <F label="Status"><Sel name="status" options={[["active", "Active"], ["inactive", "Inactive"]]} value={x.status ?? "active"} /></F>
      </div>
      <Actions primary={edit ? "Save changes" : "Create brand"} />
    </ActionForm>
  );
}

export function ClientLoginForm({ brandId, brandName }: { brandId: string; brandName: string }) {
  return (
    <ActionForm action={addClientLogin} className="dform">
      <div className="eyebrow">Portal login · {brandName}</div>
      <h2>Another key to the {em("door.")}</h2>
      <div className="form">
        <input type="hidden" name="brandId" value={brandId} />
        <F label="Name"><input name="name" required /></F>
        <div className="two"><F label="Email"><input name="email" type="email" required /></F><F label="Mobile / WhatsApp"><input name="mobile" /></F></div>
        <p className="muted small" style={{ margin: 0 }}>They get a link to set their own password. Passwords are never visible here.</p>
      </div>
      <Actions primary="Send invite" />
    </ActionForm>
  );
}

// ---------------- user ----------------
export type UserInit = Record<string, string | null | undefined> & { id?: string; photo?: string | null };
export function UserForm({ u, role }: { u?: UserInit; role?: string }) {
  const L = useLookups();
  const x = (u ?? {}) as Record<string, string | undefined>;
  const edit = !!u?.id;
  const [r, setR] = useState(x.role ?? role ?? "employee");
  const ga = L.me.role === "group_admin";
  const [g, setG] = useState(x.groupId ?? (ga ? L.me.groupId ?? "" : ""));
  const staffRole = r === "cs" || r === "employee" || r === "group_admin";
  // Hierarchy: employee → a CS (or group admin) of the same group; CS → a group admin of the group.
  const bosses = L.staff.filter((p) => p.id !== u?.id && p.groupId === g && (r === "employee" ? p.role === "cs" || p.role === "group_admin" : p.role === "group_admin"));
  const roleOpts: [string, string][] = ga ? [["employee", "Employee"], ["cs", "Client servicing"]]
    : [["employee", "Employee"], ["cs", "Client servicing"], ["group_admin", "Group admin"], ["admin", "Admin"], ["client", "Client"]];
  const fi = (label: string, k: string, type = "text", ph?: string) => <F label={label}><input type={type} name={k} defaultValue={x[k] ?? ""} placeholder={ph} /></F>;
  return (
    <ActionForm action={saveUser} className="dform">
      <div className="eyebrow">{edit ? "Edit user" : r === "client" ? "Add client login" : "Add team member"}</div>
      <h2>{edit ? `${x.firstName} ${x.lastName ?? ""}` : <>One more {em("at the counter.")}</>}</h2>
      <div className="form">
        {edit ? <input type="hidden" name="id" value={u!.id} /> : null}
        <div className="two">{fi("First name", "firstName")}{fi("Last name", "lastName")}</div>
        <div className="two">
          <F label="Role"><select name="role" value={r} onChange={(e) => setR(e.target.value)}>{roleOpts.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></F>
          {r === "client"
            ? <F label="Brand"><Sel name="brandId" options={L.brands.map((b) => [b.id, b.name])} value={x.brandId} required /></F>
            : <F label="Department"><Sel name="departmentId" options={L.depts.map((d) => [d.id, d.name])} value={x.departmentId} placeholder="—" /></F>}
        </div>
        {staffRole ? (
          <div className="two">
            {ga ? <F label="Group"><input type="hidden" name="groupId" value={g} /><input value={L.groups.find((x) => x.id === g)?.name ?? "—"} disabled /></F>
              : <F label="Group"><select name="groupId" value={g} onChange={(e) => setG(e.target.value)}><option value="">{r === "group_admin" ? "Pick a group" : "No group"}</option>{L.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></F>}
            {r === "group_admin" ? <F label="Reports to"><input value="Admin" disabled /></F>
              : <F label="Reports to"><Sel name="reportsToId" key={`${g}-${r}`} options={bosses.map((p) => [p.id, `${p.name} · ${p.role === "cs" ? "CS" : "Group admin"}`])} value={x.reportsToId} placeholder={g ? "—" : "Pick a group first"} /></F>}
          </div>
        ) : null}
        <div className="two">{fi("Designation", "designation")}<UploadOne name="photo" label="Photo" hint="Square works best · shows on tasks and attendance" round existing={u?.photo} /></div>
        <div className="two">
          <F label="Gender"><Sel name="gender" options={[["", "—"], ["female", "Female"], ["male", "Male"], ["other", "Other"]]} value={x.gender ?? ""} /></F>
          {fi("Date of birth", "dob", "date")}
        </div>
        <Sec>Contact</Sec>
        <div className="two">{fi("Work email", "email", "email")}{fi("Login ID", "loginId", "text", "defaults to email")}</div>
        <div className="two">{fi("Mobile", "mobile")}{fi("WhatsApp", "whatsappNo")}</div>
        <div className="two">{fi("Personal email", "personalEmail")}{fi("Personal contact", "personalContact")}</div>
        <Sec>Address</Sec>
        {fi("Address", "address")}
        <div className="two">{fi("City", "city")}{fi("State", "state")}</div>
        <div className="two">{fi("Pincode", "pincode")}<F label="Country"><input name="country" defaultValue={x.country ?? "India"} /></F></div>
        <Sec>Social</Sec>
        <div className="two">{fi("LinkedIn", "linkedin")}{fi("Instagram", "instagram")}</div>
        {fi("Facebook", "facebook")}
        <Sec>Access</Sec>
        <F label="Status"><Sel name="status" options={[["active", "Active"], ["inactive", "Inactive"]]} value={x.status ?? "active"} /></F>
        {edit ? null : <Switch name="invite" label="Send invite on WhatsApp + email" sub="They set their own password · nothing stored in plain text" defaultOn />}
      </div>
      <Actions primary={edit ? "Save" : "Send invite"} />
    </ActionForm>
  );
}

// ---------------- invoice ----------------
export function InvoiceForm({ brandId }: { brandId?: string }) {
  const L = useLookups();
  const [items, setItems] = useState([{ k: 1 }]);
  const [lines, setLines] = useState<Record<number, { q: number; r: number }>>({});
  const [gst, setGst] = useState(18);
  const sub = useMemo(() => Object.values(lines).reduce((s, l) => s + (l.q || 0) * (l.r || 0), 0), [lines]);
  const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
  return (
    <ActionForm action={saveInvoice} className="dform">
      <div className="eyebrow">Raise invoice</div>
      <h2>Send the {em("bill.")}</h2>
      <div className="form">
        <F label="Brand"><Sel name="brandId" options={L.brands.map((b) => [b.id, b.name])} value={brandId} required /></F>
        <div className="field">Line items
          <div className="lineitems">
            {items.map((it) => (
              <div className="li" key={it.k}>
                <input name="itemDesc" placeholder="Monthly retainer · October" />
                <input name="itemQty" type="number" min="1" step="1" defaultValue={1} onChange={(e) => setLines({ ...lines, [it.k]: { ...lines[it.k], q: +e.target.value } })} />
                <input name="itemRate" placeholder="₹ rate" inputMode="decimal" onChange={(e) => setLines({ ...lines, [it.k]: { q: lines[it.k]?.q ?? 1, r: +e.target.value.replace(/[^\d.]/g, "") } })} />
                <button type="button" className="ibtn sm" onClick={() => { setItems(items.filter((x) => x.k !== it.k)); const n = { ...lines }; delete n[it.k]; setLines(n); }}>×</button>
              </div>
            ))}
            <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setItems([...items, { k: Date.now() }])}>+ Add line</button>
          </div>
        </div>
        <div className="two">
          <F label="GST"><select name="gstRate" value={gst} onChange={(e) => setGst(+e.target.value)}><option value={18}>18%</option><option value={0}>0% (export)</option></select></F>
          <F label="Total"><input disabled value={`${fmt(sub)} + ${fmt((sub * gst) / 100)} GST = ${fmt(sub * (1 + gst / 100))}`} /></F>
        </div>
        <div className="two">
          <F label="Issue date"><input type="date" name="issueDate" defaultValue={today()} /></F>
          <F label="Due"><select name="dueRule"><option>7th of next month</option><option>30 days</option><option>15 days</option><option>On receipt</option></select></F>
        </div>
        <F label="Notes (shows on the invoice)"><textarea name="notes" placeholder="Monthly retainer · October" /></F>
        <Switch name="razorpay" label="Razorpay payment link" sub="Client pays from their portal · UPI, card, netbanking" defaultOn />
        <Switch name="reminders" label="Sarthi reminders" sub="3 days before, on due date, then every 5 days" defaultOn />
      </div>
      <div className="actions">
        <button className="btn primary" type="submit" name="send" value="1">Send to client</button>
        <button className="btn" type="submit" name="send" value="0">Save draft</button>
      </div>
    </ActionForm>
  );
}

export function OfflinePaymentForm({ id, label, balance }: { id: string; label: string; balance: string }) {
  return (
    <ActionForm action={recordOffline} className="dform">
      <div className="eyebrow">{label}</div>
      <h2>Record a {em("payment.")}</h2>
      <div className="form">
        <input type="hidden" name="id" value={id} />
        <div className="two"><F label="Amount received (₹)"><input name="amount" defaultValue={balance} inputMode="decimal" required /></F>
          <F label="Method"><select name="method"><option value="offline">Bank transfer / cheque</option><option value="upi">UPI</option><option value="card">Card</option><option value="netbanking">Netbanking</option></select></F></div>
        <F label="Reference"><input name="reference" placeholder="UTR / cheque no." /></F>
        <p className="muted small" style={{ margin: 0 }}>Partial payments are fine. The invoice turns paid when the total is covered.</p>
      </div>
      <Actions primary="Record payment" />
    </ActionForm>
  );
}

// ---------------- flag ----------------
export function FlagForm({ personId, cs, employeesOnly }: { personId?: string; cs?: boolean; employeesOnly?: boolean }) {
  const L = useLookups();
  const [forCs, setForCs] = useState(!!cs && !employeesOnly);
  const people = forCs ? L.cs : L.employees;
  return (
    <ActionForm action={raiseFlag} className="dform">
      <div className="eyebrow">Raise a flag</div>
      <h2>Say it {em("on the record.")}</h2>
      <div className="form">
        <div className="two">
          <F label="For"><select value={forCs ? "cs" : "emp"} onChange={(e) => setForCs(e.target.value === "cs")} disabled={employeesOnly}><option value="emp">Employee</option>{employeesOnly ? null : <option value="cs">Client servicing</option>}</select></F>
          <F label="Person"><Sel name="targetUserId" options={people.map((p) => [p.id, p.name])} value={personId} required /></F>
        </div>
        <F label="Flag"><Sel name="flagTypeId" options={L.flagTypes.map((f) => [f.id, `${f.name} · ${f.points > 0 ? "+" : ""}${f.points}${f.note ? ` · ${f.note}` : ""}`])} required /></F>
        <div className="two">
          <F label="Brand"><Sel name="brandId" options={L.brands.map((b) => [b.id, b.name])} placeholder="—" /></F>
          <F label="Project"><Sel name="projectId" options={L.projects.slice(0, 60).map((p) => [p.id, p.name])} placeholder="—" /></F>
        </div>
        <F label="Subject"><input name="subject" placeholder="One line" /></F>
        <F label="Feedback"><textarea name="feedback" placeholder="Specific. This shows on their profile with your name and date." required /></F>
      </div>
      <Actions primary="Save flag" />
    </ActionForm>
  );
}

// ---------------- concern ----------------
export function ConcernForm() {
  const L = useLookups();
  return (
    <ActionForm action={logConcern} className="dform">
      <div className="eyebrow">Log a concern</div>
      <h2>On someone&apos;s {em("behalf.")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Employees normally raise these themselves from their portal. Use this when someone told you in person.</p>
      <div className="form">
        <div className="two">
          <F label="Raised by"><Sel name="raisedBy" options={[...L.employees, ...L.cs].map((p) => [p.id, p.name])} required /></F>
          <F label="Category"><Sel name="category" options={Object.entries(CONCERN_CATEGORIES)} /></F>
        </div>
        <F label="Subject"><input name="subject" required /></F>
        <F label="Details"><textarea name="details" placeholder="In their words, as far as possible" required /></F>
        <UploadOne name="file" label="Screenshot (optional)" hint="If they shared one" />
        <div className="two">
          <F label="Owner"><Sel name="ownerUserId" options={[...L.admins, ...L.cs].map((p) => [p.id, p.name])} /></F>
          <F label="Reply SLA"><select name="slaHours"><option value="24">24 hours</option><option value="8">Same day</option><option value="72">3 days</option></select></F>
        </div>
        <Switch name="confidential" label="Confidential" sub="Hidden from CS leads · admin and owner only" defaultOn />
      </div>
      <Actions primary="Log concern" />
    </ActionForm>
  );
}

// ---------------- announcement / holiday ----------------
export type AnnInit = { id?: string; type?: string; subject?: string; dateKey?: string; message?: string; clients?: boolean; broadcast?: boolean; image?: string | null };
export function AnnouncementForm({ a = {}, holiday }: { a?: AnnInit; holiday?: boolean }) {
  const isHoliday = holiday || a.type === "holiday";
  return (
    <ActionForm action={saveAnnouncement} className="dform">
      <div className="eyebrow">{a.id ? "Edit" : isHoliday ? "Add holiday" : "New announcement"}</div>
      <h2>{a.id ? a.subject : isHoliday ? <>Office {em("closed.")}</> : <>Pin it to the {em("board.")}</>}</h2>
      <div className="form">
        {a.id ? <input type="hidden" name="id" value={a.id} /> : null}
        {isHoliday && !a.id ? <input type="hidden" name="type" value="holiday" /> : <F label="Type"><Sel name="type" options={[["announcement", "Announcement"], ["holiday", "Holiday"]]} value={a.type ?? "announcement"} /></F>}
        <F label={isHoliday ? "Name" : "Subject"}><input name="subject" defaultValue={a.subject} placeholder={isHoliday ? "e.g. Holi" : ""} required /></F>
        <F label="Date"><input type="date" name="date" defaultValue={a.dateKey} required /></F>
        <F label={isHoliday ? "Note" : "Message"}><textarea name="message" defaultValue={a.message ?? (isHoliday ? "Office closed." : "")} /></F>
        {isHoliday ? null : <UploadOne name="image" label="Image (optional)" hint="Poster or creative for the notice" existing={a.image} />}
        <Switch name="showToClients" label="Show to clients" sub={isHoliday ? "So nobody expects a same-day delivery" : "Appears on every client portal"} defaultOn={a.clients ?? isHoliday} />
        {isHoliday ? null : <Switch name="broadcast" label="WhatsApp broadcast via Sarthi" sub="Team now · clients in tomorrow's digest" defaultOn={a.broadcast ?? true} />}
      </div>
      <Actions primary={a.id ? "Save" : isHoliday ? "Add" : "Post"} />
    </ActionForm>
  );
}

// ---------------- request (log on behalf) ----------------
export function RequestForm({ brandId }: { brandId?: string }) {
  const L = useLookups();
  const [brand, setBrand] = useState(brandId ?? L.brands[0]?.id);
  return (
    <ActionForm action={raiseRequest} className="dform">
      <div className="eyebrow">Log a work request</div>
      <h2>On the client&apos;s {em("behalf.")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Clients raise these from their portal. Use this for a WhatsApp or phone ask.</p>
      <div className="form">
        <div className="two">
          <F label="Brand"><select name="brandId" value={brand} onChange={(e) => setBrand(e.target.value)}>{L.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
          <F label="Project"><Sel name="projectId" options={L.projects.filter((p) => p.brandId === brand).map((p) => [p.id, p.name])} placeholder="—" /></F>
        </div>
        <F label="Subject"><input name="subject" required /></F>
        <F label="Description"><textarea name="description" /></F>
        <div className="two"><F label="Needed by"><input type="date" name="neededBy" /></F><F label="Came in via"><select name="channel"><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option></select></F></div>
        <div className="two"><F label="POC"><input name="pocName" /></F><F label="POC contact"><input name="pocContact" /></F></div>
        <UploadMany name="files" label="Reference images" hint="What the client sent on WhatsApp" linkName="link" />
        <div className="two"><F label="Reference link"><input name="referenceLink" placeholder="Site / Figma" /></F><F label="Priority"><Sel name="priority" options={PRI} value="normal" /></F></div>
      </div>
      <Actions primary="Log request" />
    </ActionForm>
  );
}

// ---------------- settings drawers ----------------
const TONES: [string, string][] = [["neutral", "Neutral"], ["crimson", "Crimson"], ["gold", "Gold"], ["muted", "Muted"]];
export function StatusForm({ id, used }: { id?: string; used?: number }) {
  const L = useLookups();
  const s = L.statuses.find((x) => x.id === id);
  const locked = !!(s?.isStart || s?.isDone);
  const { close, toast } = useUi();
  return (
    <ActionForm action={saveStatus} className="dform">
      <div className="eyebrow">{s ? "Edit status" : "Add status"}</div>
      <h2>{s ? s.name : <>A new {em("stop")} on the board.</>}</h2>
      <div className="form">
        {s ? <input type="hidden" name="id" value={s.id} /> : null}
        <F label="Name"><input name="name" defaultValue={s?.name} readOnly={locked} placeholder="e.g. Client changes" required /></F>
        <F label="Colour"><Sel name="tone" options={TONES} value={s?.tone ?? "neutral"} /></F>
        {s ? null : <F label="Position"><select name="position" defaultValue={L.statuses.length - 1}>{L.statuses.slice(0, -1).map((x, k) => <option key={x.id} value={k + 1}>After {x.name}</option>)}</select></F>}
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
          {locked ? "New and Completed are the fixed ends of the board; you can recolour them, not rename or remove."
            : !s ? "Shows as a board column and in every “Move to” menu the moment you save."
              : `${used ?? 0} task${used === 1 ? "" : "s"} currently sit${used === 1 ? "s" : ""} here. Renaming carries them along.${used ? " Move them before removing." : ""}`}
        </p>
      </div>
      <div className="actions">
        <button className="btn primary" type="submit">{s ? "Save" : "Add status"}</button>
        {s && !locked ? <button className="btn" type="button" style={{ color: "var(--brand-ink)" }} disabled={!!used}
          onClick={async () => { const fd = new FormData(); fd.set("id", s.id); const r = await removeStatus(fd); toast(r.ok ? r.message ?? "Removed" : r.error); if (r.ok) { close(); location.reload(); } }}>Remove</button> : null}
        <button className="btn" type="button" onClick={close}>Cancel</button>
      </div>
    </ActionForm>
  );
}

const COLOURS: [string, string][] = [["gold", "Gold"], ["crimson", "Crimson"], ["cream", "Cream"], ["muted", "Muted"]];
export function FlagTypeForm({ id, used }: { id?: string; used?: number }) {
  const L = useLookups();
  const f = L.flagTypes.find((x) => x.id === id);
  const { close, toast } = useUi();
  return (
    <ActionForm action={saveFlagType} className="dform">
      <div className="eyebrow">{f ? "Edit flag" : "Add flag"}</div>
      <h2>{f ? f.name : <>A new {em("colour.")}</>}</h2>
      <div className="form">
        {f ? <input type="hidden" name="id" value={f.id} /> : null}
        <F label="Name"><input name="name" defaultValue={f?.name} placeholder="e.g. Client praise" required /></F>
        <div className="two">
          <F label="Colour"><Sel name="colour" options={COLOURS} value={f?.colour ?? "cream"} /></F>
          <F label="Points (− or +)"><input type="number" name="points" defaultValue={f?.points ?? 0} /></F>
        </div>
        <F label="Note"><input name="note" defaultValue={f?.note} placeholder="When to use it" /></F>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{f ? `${used ?? 0} given this month.${used ? " A flag in use can be renamed, not removed." : ""}` : "Appears in every “Raise a flag” form on save. Points move the monthly score, capped at ±15."}</p>
      </div>
      <div className="actions">
        <button className="btn primary" type="submit">{f ? "Save" : "Add flag"}</button>
        {f ? <button className="btn" type="button" style={{ color: "var(--brand-ink)" }} disabled={!!used}
          onClick={async () => { const fd = new FormData(); fd.set("id", f.id); const r = await removeFlagType(fd); toast(r.ok ? r.message ?? "Removed" : r.error); if (r.ok) { close(); location.reload(); } }}>Remove</button> : null}
        <button className="btn" type="button" onClick={close}>Cancel</button>
      </div>
    </ActionForm>
  );
}

const LIST_TITLE: Record<string, [string, string]> = { group: ["Group", "team"], dept: ["Department", "desk"], scope: ["Scope of work", "service"], title: ["Task title", "type"], servicing: ["Servicing type", "desk"] };
export function ListItemForm({ kind, item }: { kind: "group" | "dept" | "scope" | "title" | "servicing"; item?: { id: string; name: string; status?: string; rate?: string; short?: string } }) {
  const [t, w] = LIST_TITLE[kind];
  return (
    <ActionForm action={saveListItem} className="dform">
      <div className="eyebrow">{t}</div>
      <h2>{item ? item.name : <>Add a {em(`${w}.`)}</>}</h2>
      <div className="form">
        <input type="hidden" name="kind" value={kind} />
        {item ? <input type="hidden" name="id" value={item.id} /> : null}
        <F label="Name"><input name="name" defaultValue={item?.name} required /></F>
        {kind === "scope" ? <F label="Default rate card (₹)"><input name="rate" defaultValue={item?.rate} placeholder="₹" /></F> : null}
        {kind === "servicing" ? <F label="Short description"><input name="short" defaultValue={item?.short} /></F> : null}
        {item ? <F label="Status"><Sel name="status" options={[["active", "Active"], ["inactive", "Hidden from new forms"]]} value={item.status ?? "active"} /></F> : null}
      </div>
      <Actions primary={item ? "Save" : "Add"} />
    </ActionForm>
  );
}

export type CompanyInit = { legalName: string; brandName: string; gstin: string; address: string; city: string; state: string; pincode: string; portalUrl: string; studioHoursStart: string; studioHoursEnd: string; lateLoginAfter: string; workingDays: number[] };
export function CompanyForm({ c }: { c: CompanyInit }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <ActionForm action={saveCompany} className="dform">
      <div className="eyebrow">Company</div>
      <h2>Coffee {em("&")} Creative</h2>
      <div className="form">
        <div className="two"><F label="Legal name"><input name="legalName" defaultValue={c.legalName} /></F><F label="Brand name"><input name="brandName" defaultValue={c.brandName} /></F></div>
        <div className="two"><F label="GSTIN"><input name="gstin" defaultValue={c.gstin} /></F><F label="Portal URL"><input name="portalUrl" defaultValue={c.portalUrl} /></F></div>
        <F label="Address"><input name="address" defaultValue={c.address} /></F>
        <div className="two"><F label="City"><input name="city" defaultValue={c.city} /></F><F label="State"><input name="state" defaultValue={c.state} /></F></div>
        <F label="Pincode"><input name="pincode" defaultValue={c.pincode} /></F>
        <div className="two"><F label="Studio opens"><input type="time" name="studioHoursStart" defaultValue={c.studioHoursStart} /></F><F label="Studio closes"><input type="time" name="studioHoursEnd" defaultValue={c.studioHoursEnd} /></F></div>
        <F label="Late login after (IST)"><input type="time" name="lateLoginAfter" defaultValue={c.lateLoginAfter} /></F>
        <div className="field">Working days
          <div className="chips">{days.map((d, i) => (
            <label key={d} className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="workingDays" value={i + 1} defaultChecked={c.workingDays.includes(i + 1)} />{d}
            </label>
          ))}</div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Timezone is fixed to Asia/Kolkata (IST).</p>
      </div>
      <Actions primary="Save" />
    </ActionForm>
  );
}

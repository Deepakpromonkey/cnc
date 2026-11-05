"use client";
import { useLookups } from "../lookups";
import { useMemo, useState } from "react";
import { ActionButton, Chips, Search, useLiveDrawer, useUi } from "../kit";
import { Field, PageHead, Pill, PlusIcon, Ring, Stats, Tags, Who, ini, LinkOrDash } from "../ui";
import { BrandForm, ClientLoginForm, InvoiceForm, ProjectForm, TaskForm } from "./forms";
import { PriPill, ProjectDrawer, StatusPill, TaskDrawer, type ProjectVM } from "./task-drawer";
import { impersonate } from "@/app/actions/common";
import { sendUserReset } from "@/app/actions/people";
import type { BrandStat } from "@/lib/brand-stats";
import type { ProjectRowVM, TaskVM } from "@/lib/views";
import { FREQUENCY_LABEL } from "@/lib/status";

export type BrandVM = BrandStat & {
  logo: string | null; profile: Record<string, string | null>; scopeIds: string[]; scopeNames: string[];
  clients: { id: string; name: string; email: string; status: string; last: string; invited: boolean }[];
  counts: { projects: number; tasks: number; notStarted: number; done: number };
};

const retainer = (b: BrandVM) => b.frequency !== "project_based";

export function BrandsView({ brands, tasks, projects, initial }: { brands: BrandVM[]; tasks: TaskVM[]; projects: ProjectRowVM[]; initial: string | null }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(initial);
  const [tab, setTab] = useState("profile");
  const openTask = useLiveDrawer(tasks, (t) => <TaskDrawer t={t} />, "task");
  const openProject = useLiveDrawer(projects, (p) => <ProjectDrawer p={p as ProjectVM} />, "project");

  const rows = useMemo(() => brands.filter((b) => {
    if (f === "Retainers" && !retainer(b)) return false;
    if (f === "Project-based" && retainer(b)) return false;
    if (f === "Needs attention" && b.health >= 80) return false;
    if (f === "Awaiting client" && !b.waiting) return false;
    if (f === "Inactive" ? b.status !== "inactive" : b.status === "inactive") return false;
    const s = q.toLowerCase();
    if (s && !`${b.name} ${b.company} ${b.cs.map((c) => c.name).join(" ")}`.toLowerCase().includes(s)) return false;
    return true;
  }), [brands, f, q]);
  const active = brands.filter((b) => b.status === "active");
  const b = brands.find((x) => x.id === sel) ?? rows[0] ?? brands[0];
  const bTasks = tasks.filter((t) => t.brandId === b?.id);
  const bProjects = projects.filter((p) => p.brandId === b?.id);
  const p = b?.profile ?? {};
  // Brand records, client logins and invoices belong to the super admin; group admins plan work on them.
  const superAdmin = useLookups().me.role === "admin";

  return (
    <section className="view on">
      <PageHead eyebrow="Brands" title={<>{active.length} cups <em>on the counter.</em></>} sub="Every client CNC serves, who looks after them, and how warm the relationship is this month."
        actions={superAdmin ? <button className="btn" onClick={() => open(<BrandForm />)}><PlusIcon />Add brand</button> : null} />
      <Stats items={[[active.length, "Brands"], [active.filter(retainer).length, "On retainer", "gold"], [active.reduce((s, x) => s + x.open, 0), "Open tasks"], [active.reduce((s, x) => s + x.waiting, 0), "Awaiting client"], [active.filter((x) => x.health < 80).length, "Cooling", "hot"]]} />
      <div className="bar">
        <Chips value={f} onChange={setF} items={[["All", active.length], ["Retainers", active.filter(retainer).length], ["Project-based", active.filter((x) => !retainer(x)).length], ["Needs attention", active.filter((x) => x.health < 80).length], ["Awaiting client", active.filter((x) => x.waiting).length], ["Inactive", brands.length - active.length]]} />
        <Search value={q} onChange={setQ} placeholder="Search brand or CS" />
      </div>
      <div className="split">
        <div className="scroll">
          <table className="tbl"><thead><tr><th>Brand · engagement</th><th>CS</th><th className="r">Open</th><th className="r hide-lg">Waiting</th><th>Health</th><th>Invoice</th><th className="hide-md">Last activity</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((x) => (
                <tr key={x.id} className={x.id === b?.id ? "sel" : ""} onClick={() => { setSel(x.id); setTab("profile"); }}>
                  <td className="n"><span className="bar" style={{ gap: 10, flexWrap: "nowrap" }}><span className="blogo">{x.logo ? <img src={x.logo} alt="" /> : ini(x.name)}</span><span style={{ minWidth: 0 }}><span style={{ whiteSpace: "nowrap" }}>{x.name}</span><small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }} title={x.company}>{x.type}{x.company && x.company !== x.name ? ` · ${x.company}` : ""}</small></span></span></td>
                  <td className="nowrap">{x.cs[0] ? <Who n={x.cs[0].name} /> : "—"}{x.cs.length > 1 ? <small style={{ color: "var(--muted)" }}> +{x.cs.length - 1}</small> : null}</td>
                  <td className="r big">{x.open}{x.waiting ? <small className="hide-lg-inline" style={{ display: "block", fontSize: 10, color: "var(--muted)", fontFamily: "Manrope,sans-serif" }}>{x.waiting} waiting</small> : null}</td>
                  <td className="r hide-lg">{x.waiting ? <b>{x.waiting}</b> : "—"}</td>
                  <td className="nowrap"><span className="mini" style={{ width: 48 }}><i style={{ width: `${x.health}%` }} /></span><b className="num">{x.health}</b></td>
                  <td className="nowrap">{x.invHot ? <span style={{ color: "var(--brand-ink)", fontWeight: 700 }}>{x.inv}</span> : x.inv}</td>
                  <td className="nowrap hide-md" style={{ color: "var(--muted)" }}>{x.last}</td>
                </tr>
              )) : <tr><td colSpan={7} className="empty">No brands match.</td></tr>}
            </tbody></table>
        </div>
        {b ? (
          <div className="card">
            <div className="card-h">
              <div><div className="eyebrow">{b.company}</div><h2>{b.name}</h2>
                <div className="bar" style={{ marginTop: 8, gap: 6 }}><Pill cls="dim">{b.status === "active" ? "Active" : "Inactive"}</Pill><span className="tag">{b.type}</span>{p.division ? <span className="tag">{p.division}</span> : null}</div></div>
              <Ring v={b.health} />
            </div>
            <Stats cols={4} items={[[b.counts.projects, "Projects"], [b.counts.tasks, "Tasks"], [b.counts.notStarted, "Not started"], [b.counts.done, "Completed", "gold"]]} />
            <Chips value={tab} onChange={setTab} items={[["profile", null, "Profile"], ["projects", bProjects.length, "Projects"], ["tasks", bTasks.length, "Open tasks"], ["logins", b.clients.length, "Portal logins"]]} />
            {tab === "profile" ? (
              <div className="pgrid">
                <Field label="Company name" value={p.companyName} /><Field label="Brand name" value={p.name} /><Field label="Division" value={p.division} />
                <Field label="Address" value={p.address} wide /><Field label="City" value={p.city} /><Field label="State" value={p.state} /><Field label="Pincode" value={p.pincode} /><Field label="Country" value={p.country} />
                <div className="pf wide"><span>Scope of work</span><Tags items={b.scopeNames} /></div>
                <div className="pf wide"><span>Client servicing</span><div className="bar" style={{ marginTop: 4, gap: 10 }}>{b.cs.map((c, i) => <Who key={c.id} n={c.name} sub={i === 0 ? "primary" : undefined} />)}</div></div>
                <Field label="Frequency" value={FREQUENCY_LABEL[p.frequency ?? ""] } /><Field label="Payment terms" value={p.paymentTerms} /><Field label="Fee" value={p.feeNote} /><Field label="Client since" value={p.sinceYear} />
                <Field label="Official email" value={p.officialEmail} /><Field label="WhatsApp" value={p.whatsapp} /><Field label="POC" value={p.pocName} /><Field label="POC phone" value={p.pocPhone} />
                <Field label="Website"><LinkOrDash href={p.website} /></Field><Field label="Instagram" value={p.instagram} /><Field label="LinkedIn" value={p.linkedin} /><Field label="Facebook" value={p.facebook} />
                <Field label="Twitter / X" value={p.twitter} /><Field label="Other link"><LinkOrDash href={p.otherSocialLink} /></Field><Field label="GST" value={p.gstin} /><Field label="VAT number" value={p.vatNumber} />
                <Field label="Additional information" value={p.additionalInformation} wide />
              </div>
            ) : tab === "projects" ? (
              <div className="list">{bProjects.length ? bProjects.map((x) => (
                <div key={x.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "10px 0", cursor: "pointer" }} onClick={() => openProject(x)}>
                  <div className="t" style={{ fontSize: 13 }}>{x.name}<span>{x.type}{x.subType ? ` · ${x.subType}` : ""} · {x.start} → {x.deadline} · {x.tasks.length} tasks</span></div>
                  <div className="r"><StatusPill s={x.status} /><PriPill p={x.priority} label={x.priorityLabel} /></div>
                </div>)) : <div className="empty">No projects yet.</div>}</div>
            ) : tab === "tasks" ? (
              <div className="list">{bTasks.length ? bTasks.map((t) => (
                <div key={t.id} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "10px 0", cursor: "pointer" }} onClick={() => openTask(t)}>
                  <div className="t" style={{ fontSize: 13 }}>{t.name}<span>{t.assignees.map((a) => a.name).join(", ")} · due {t.due}{t.isLate ? <> · <b style={{ color: "var(--brand-ink)" }}>{t.late}</b></> : null}</span></div>
                  <div className="r"><StatusPill s={t.status} /></div>
                </div>)) : <div className="empty">Nothing open. Quiet cup.</div>}</div>
            ) : (
              <>
                <div className="rolelist">{b.clients.length ? b.clients.map((c) => (
                  <div key={c.id}><span className="ava">{ini(c.name)}</span><div><b>{c.name}</b><small>{c.email} · {c.invited ? "invited, not set up yet" : `last seen ${c.last}`}</small></div>
                    <div className="bar" style={{ gap: 6 }}>
                      <Pill cls={c.status === "active" ? "gold" : "dim"}>{c.status === "active" ? "Active" : "Inactive"}</Pill>
                      {superAdmin ? <ActionButton action={sendUserReset} values={{ id: c.id }} className="btn" style={{ padding: "5px 10px", fontSize: 11 }}>Send reset</ActionButton> : null}
                      {superAdmin && c.status === "active" ? <ActionButton action={impersonate} values={{ userId: c.id }} className="btn" style={{ padding: "5px 10px", fontSize: 11 }} confirm={`View the portal as ${c.name}? This is logged.`}>View as client</ActionButton> : null}
                    </div></div>
                )) : <div className="empty">No portal logins yet.</div>}</div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Passwords are set by the client on first login and never visible here. &quot;Reset&quot; sends them a link.</p>
                {superAdmin ? <div className="actions"><button className="btn" onClick={() => open(<ClientLoginForm brandId={b.id} brandName={b.name} />)}>Add client login</button></div> : null}
              </>
            )}
            <div className="actions">
              {superAdmin ? <button className="btn primary" onClick={() => open(<BrandForm b={{ fields: p, id: b.id, csIds: b.cs.map((c) => c.id), scopeIds: b.scopeIds, logo: b.logo }} />)}>Edit brand</button> : null}
              <button className="btn" onClick={() => open(<ProjectForm p={{ brandId: b.id, brandPoc: p.pocName ?? "", pocPhone: p.pocPhone ?? "", terms: p.paymentTerms ?? "" }} />)}>New project</button>
              <button className="btn" onClick={() => open(<TaskForm brandId={b.id} />)}>New task</button>
              {superAdmin ? <button className="btn" onClick={() => open(<InvoiceForm brandId={b.id} />)}>Raise invoice</button> : null}
            </div>
          </div>
        ) : <div className="card"><div className="empty">Add your first brand.</div></div>}
      </div>
    </section>
  );
}

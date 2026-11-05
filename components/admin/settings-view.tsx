"use client";
import Link from "next/link";
import { ActionButton, useUi } from "../kit";
import { useLookups } from "../lookups";
import { Flag, PageHead, PenIcon, Pill, PlusIcon } from "../ui";
import { CompanyForm, FlagTypeForm, ListItemForm, StatusForm, UserForm, type CompanyInit } from "./forms";
import { moveStatus } from "@/app/actions/settings";
import { FLAG_CLASS } from "@/lib/status";

type Item = { id: string; name: string; status: string; rate?: string; short?: string };

function TagList({ items, kind }: { items: Item[]; kind: "group" | "dept" | "scope" | "title" | "servicing" }) {
  const { open } = useUi();
  return (
    <div className="tags">
      {items.map((x) => (
        <span key={x.id} className="pillrow">
          <span className="tag" style={x.status === "inactive" ? { opacity: 0.45, textDecoration: "line-through" } : undefined}>{x.name}</span>
          <button className="ibtn sm" title="Edit" onClick={() => open(<ListItemForm kind={kind} item={x} />)}><PenIcon /></button>
        </span>
      ))}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type GroupItem = Item & { heads: string[]; cs: number; employees: number };

export function SettingsView({ company, roles, statusUse, flagUse, depts, titles, scope, servicing, groups, integrations }: {
  company: CompanyInit; roles: Record<string, number>; statusUse: Record<string, number>; flagUse: Record<string, number>; groups: GroupItem[];
  depts: Item[]; titles: Item[]; scope: Item[]; servicing: Item[]; integrations: { sarthi: boolean; razorpay: boolean; smtp: boolean };
}) {
  const L = useLookups();
  const { open } = useUi();
  const ROLES: [string, string, string][] = [["admin", "Admin", "Everything, incl. flags, invoices, settings"], ["group_admin", "Group admin", "Their group: brands, tasks, team, attendance; adds CS and employees"], ["cs", "Client servicing", "Brands they own, tasks, requests, ratings"], ["employee", "Employee", "Own tasks, EOD, links"], ["client", "Client", "Their brand: tasks, approvals, requests, invoices"]];
  return (
    <section className="view on">
      <PageHead eyebrow="Settings" title={<>The <em>house rules.</em></>} sub="Company, people and roles, services, statuses, integrations. Clean lists this time, one entry each." />
      <div className="sgrid">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Company</div><h2>Coffee <em>&</em> Creative</h2></div><button className="ibtn" title="Edit" onClick={() => open(<CompanyForm c={company} />)}><PenIcon /></button></div>
          <div className="kv">
            <span>Legal</span><b>{company.legalName}</b><span>GSTIN</span><b>{company.gstin || "—"}</b>
            <span>Address</span><b>{[company.address, company.city, company.state].filter(Boolean).join(", ")}</b><span>Timezone</span><b>Asia/Kolkata (IST)</b>
            <span>Studio</span><b>{company.studioHoursStart} – {company.studioHoursEnd} · {company.workingDays.map((d) => DAYS[d - 1]).join(" ")}</b>
            <span>Late after</span><b>{company.lateLoginAfter}</b><span>Portal</span><b>{company.portalUrl}</b><span>Redirects</span><b>sarpanch · paltan · badelog → one login</b>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Users & roles</div><h2>Five <em>roles,</em> one door.</h2></div>
            <div className="actions"><Link className="btn" href="/admin/people">All users</Link><button className="btn" onClick={() => open(<UserForm />)}>Add team member</button></div></div>
          <div className="rolelist">{ROLES.map(([k, n, d]) => (
            <div key={k}><span className={`ava ${k === "employee" ? "emp" : k === "group_admin" ? "admin" : k}`}>{n[0]}</span><div><b>{n}</b><small>{d}</small></div><b className="num">{roles[k] ?? 0}</b></div>
          ))}</div>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Integrations</div><h2>Plugged <em>in.</em></h2></div></div>
          <div className="integ">
            <div><span className="ava cs">WA</span><div><b>WhatsApp via Sarthi</b><small>Events go to Sarthi&apos;s webhook, signed · Sarthi sends WhatsApp</small></div><Pill cls={integrations.sarthi ? "gold" : "dim"}>{integrations.sarthi ? "Live" : "Not set"}</Pill></div>
            <div><span className="ava cs">RZ</span><div><b>Razorpay</b><small>Payment links on invoices · signed webhooks</small></div><Pill cls={integrations.razorpay ? "gold" : "dim"}>{integrations.razorpay ? "Live" : "Test / mock"}</Pill></div>
            <div><span className="ava cs">@</span><div><b>Email (Workspace SMTP)</b><small>Invites, resets, invoices, receipts</small></div><Pill cls={integrations.smtp ? "gold" : "dim"}>{integrations.smtp ? "Live" : "Logged only"}</Pill></div>
            <div><span className="ava cs">GD</span><div><b>Uploads & Drive</b><small>Images upload (10 MB, thumbnails, EXIF stripped) · heavy files via Drive / Frame.io link</small></div><Pill cls="gold">Policy on</Pill></div>
            <div><span className="ava">AI</span><div><b>Agent read access</b><small>Read-only Postgres role for Sarthi & future agents · audit logged</small></div><Link href="/admin/sarthi"><Pill cls="dim">Read only</Pill></Link></div>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Task statuses</div><h2>Your <em>flow,</em> your words.</h2></div><button className="ibtn" title="Add status" onClick={() => open(<StatusForm />)}><PlusIcon /></button></div>
          <div className="tags">{L.statuses.map((s) => (
            <span key={s.id} className="pillrow">
              {!s.isStart && !s.isDone && L.statuses.indexOf(s) > 1 ? <ActionButton action={moveStatus} values={{ id: s.id, dir: "left" }} className="ibtn sm" title="Move left">‹</ActionButton> : null}
              <Pill cls={s.cls}>{s.name}</Pill>
              <button className="ibtn sm" title="Edit" onClick={() => open(<StatusForm id={s.id} used={statusUse[s.id] ?? 0} />)}><PenIcon /></button>
              {!s.isStart && !s.isDone && L.statuses.indexOf(s) < L.statuses.length - 2 ? <ActionButton action={moveStatus} values={{ id: s.id, dir: "right" }} className="ibtn sm" title="Move right">›</ActionButton> : null}
            </span>
          ))}</div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Board order, left to right. New and Completed are fixed ends. Work-request statuses live separately: New · Answered · On hold · Converted.</p>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Task titles</div><h2>What a task <em>is.</em></h2></div><button className="btn" onClick={() => open(<ListItemForm kind="title" />)}>Add</button></div>
          <TagList items={titles} kind="title" />
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Servicing types</div><h2>Which <em>desk</em> does it.</h2></div><button className="btn" onClick={() => open(<ListItemForm kind="servicing" />)}>Add</button></div>
          <TagList items={servicing} kind="servicing" />
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Flags</div><h2>Your <em>colours.</em></h2></div><button className="ibtn" title="Add flag" onClick={() => open(<FlagTypeForm />)}><PlusIcon /></button></div>
          <div className="rolelist">{L.flagTypes.map((f) => (
            <div key={f.id}><Flag c={FLAG_CLASS[f.colour]} style={{ margin: "0 auto", width: 12, height: 14 }} /><div><b>{f.name}</b><small>{f.points > 0 ? "+" : ""}{f.points} points{f.note ? ` · ${f.note}` : ""} · {flagUse[f.id] ?? 0} this month</small></div>
              <button className="ibtn sm" title="Edit" onClick={() => open(<FlagTypeForm id={f.id} used={flagUse[f.id] ?? 0} />)}><PenIcon /></button></div>
          ))}</div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Points move the monthly score, capped at ±15.</p>
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Groups</div><h2>Who runs <em>which team.</em></h2></div><button className="btn" onClick={() => open(<ListItemForm kind="group" />)}>Add</button></div>
          <div className="rolelist">{groups.map((g) => (
            <div key={g.id} style={g.status === "inactive" ? { opacity: 0.45 } : undefined}><span className="ava admin">{g.name[0]}</span>
              <div><b>{g.name}</b><small>{g.heads.length ? `Group admin: ${g.heads.join(", ")}` : "No group admin yet"} · {g.cs} CS · {g.employees} employees</small></div>
              <button className="ibtn sm" title="Edit" onClick={() => open(<ListItemForm kind="group" item={g} />)}><PenIcon /></button></div>
          ))}</div>
          {!groups.length ? <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Add a group, then make someone its group admin from Users &amp; access.</p> : null}
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Departments</div><h2>Who sits <em>where.</em></h2></div><button className="btn" onClick={() => open(<ListItemForm kind="dept" />)}>Add</button></div>
          <TagList items={depts} kind="dept" />
        </section>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">Scope of work</div><h2>What CNC <em>sells.</em></h2></div><button className="btn" onClick={() => open(<ListItemForm kind="scope" />)}>Add</button></div>
          <TagList items={scope} kind="scope" />
        </section>
      </div>
    </section>
  );
}

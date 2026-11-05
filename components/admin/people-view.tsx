"use client";
import { useMemo, useState } from "react";
import { ActionButton, Chips, Search, useLiveDrawer, useUi } from "../kit";
import { Field, Flag, PageHead, Pill, PlusIcon, Stats, ini } from "../ui";
import { UserForm } from "./forms";
import { sendUserReset, setUserStatus } from "@/app/actions/people";
import { ROLE_LABEL, roleClass } from "@/lib/status";

export type UserVM = {
  id: string; name: string; role: string; status: string; email: string; login: string; dept: string; desig: string; mobile: string; photo: string | null; last: string;
  flags: string[]; score: number | null; tasks: number; open: number; fields: Record<string, string | null>; dobLabel: string;
  group: string; groupId: string | null; reportsTo: string; reports: number; manageable: boolean; unassigned: boolean;
};

function UserDrawer({ u }: { u: UserVM }) {
  const { open } = useUi();
  const x = u.fields;
  return (
    <>
      <div className="eyebrow">{u.role === "client" ? `Client login · ${u.dept}` : ROLE_LABEL[u.role]}</div>
      <div className="bar" style={{ gap: 14 }}>
        <span className={`ava ${roleClass(u.role)}`} style={{ width: 56, height: 56, fontSize: 16, overflow: "hidden" }}>{u.photo ? <img src={u.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : ini(u.name)}</span>
        <h2 style={{ paddingRight: 0 }}>{u.name}</h2>
      </div>
      <div className="bar"><Pill cls={u.status === "active" ? "gold" : "dim"}>{u.status === "active" ? "Active" : "Inactive"}</Pill>{u.flags.map((f, i) => <Flag key={i} c={f} />)}<span className="tag">last sign-in {u.last}</span></div>
      <div className="pgrid">
        <Field label="Designation" value={x.designation} /><Field label={u.role === "client" ? "Brand" : "Department"} value={u.dept} />
        {u.role !== "client" ? <><Field label="Group" value={u.group || "—"} /><Field label="Reports to" value={u.role === "admin" ? "—" : u.role === "group_admin" ? "Admin" : u.reportsTo || "—"} /></> : null}
        <Field label="Gender" value={x.gender} /><Field label="Date of birth" value={u.dobLabel} />
        <Field label="Work email" value={x.email} /><Field label="Login ID" value={x.loginId} />
        <Field label="Mobile" value={x.mobile} /><Field label="WhatsApp" value={x.whatsappNo} />
        <Field label="Personal email" value={x.personalEmail} /><Field label="Personal contact" value={x.personalContact} />
        <Field label="Address" value={x.address} wide /><Field label="City" value={x.city} /><Field label="State" value={x.state} />
        <Field label="Pincode" value={x.pincode} /><Field label="Country" value={x.country} />
        <Field label="LinkedIn" value={x.linkedin} /><Field label="Facebook" value={x.facebook} /><Field label="Instagram" value={x.instagram} />
      </div>
      {u.role === "employee" ? <Stats cols={3} items={[[u.tasks, "Tasks · all"], [u.open, "Open"], [u.score ?? "—", "Score", "gold"]]} /> : null}
      {u.role === "cs" || u.role === "group_admin" ? <Stats cols={2} items={[[u.reports, "Report to them"], [u.open, "Own open tasks"]]} /> : null}
      {u.unassigned ? <div className="actions">
        <button className="btn primary" onClick={() => open(<UserForm u={{ ...x, id: u.id, photo: u.photo }} />)}>Add to my team</button>
        <span className="muted small">Not in any group yet. Pick who they report to and save.</span>
      </div> : u.manageable ? <div className="actions">
        <button className="btn primary" onClick={() => open(<UserForm u={{ ...x, id: u.id, photo: u.photo }} />)}>Edit</button>
        <ActionButton action={sendUserReset} values={{ id: u.id }}>Send password reset</ActionButton>
        {u.status === "active"
          ? <ActionButton action={setUserStatus} values={{ id: u.id, status: "inactive" }} style={{ color: "var(--brand-ink)" }} confirm={`Deactivate ${u.name}? They are signed out everywhere.`}>Deactivate</ActionButton>
          : <ActionButton action={setUserStatus} values={{ id: u.id, status: "active" }}>Reactivate</ActionButton>}
      </div> : null}
    </>
  );
}

type SortKey = "name" | "role" | "dept" | "group";
const ROLE_ORDER: Record<string, number> = { admin: 0, group_admin: 1, cs: 2, employee: 3, client: 4 };

/** Download the visible rows as a CSV (name, role, group, department, designation, mobile, email, login, status). */
function exportCsv(rows: UserVM[]) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Role", "Group", "Reports to", "Department / Brand", "Designation", "Mobile", "Email", "Login ID", "Status", "Last sign-in"];
  const body = rows.map((u) => [u.name, ROLE_LABEL[u.role], u.group, u.reportsTo, u.dept, u.desig, u.mobile, u.email, u.login, u.status, u.last].map(esc).join(","));
  const blob = new Blob([[head.map(esc).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cnc-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

export function PeopleView({ users, deptCount, groups, superAdmin, initial }: { users: UserVM[]; deptCount: number; groups: string[]; superAdmin: boolean; initial?: string | null }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [grp, setGrp] = useState("All groups");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "role", dir: 1 });
  const openUser = useLiveDrawer(users, (u) => <UserDrawer u={u} />, "user", initial);
  const map: Record<string, string> = { Admins: "admin", "Group admins": "group_admin", "Client servicing": "cs", Employees: "employee", Clients: "client" };
  const rows = useMemo(() => {
    const list = users.filter((u) => {
      if (f === "Inactive") { if (u.status !== "inactive") return false; }
      else if (f === "Unassigned") { if (!u.unassigned) return false; }
      else if (!superAdmin && f !== "All" && u.unassigned) return false;
      else if (map[f] && u.role !== map[f]) return false;
      if (grp !== "All groups" && (grp === "No group" ? !!u.group || u.role === "client" : u.group !== grp)) return false;
      const s = q.toLowerCase();
      return !s || `${u.name} ${u.email} ${u.desig} ${u.dept} ${u.group} ${u.reportsTo} ${u.login}`.toLowerCase().includes(s);
    });
    const key = (u: UserVM) => sort.key === "name" ? u.name.toLowerCase() : sort.key === "dept" ? `${u.dept} ${u.name}`.toLowerCase() : sort.key === "group" ? `${u.group || "zzz"} ${u.name}`.toLowerCase() : `${ROLE_ORDER[u.role] ?? 9} ${u.name.toLowerCase()}`;
    return list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, f, q, grp, superAdmin, sort]);
  const count = (r: string) => users.filter((u) => u.role === r).length;
  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className={`sortable${sort.key === k ? " on" : ""}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {children}{sort.key === k ? <span className="arrow">{sort.dir === 1 ? "↑" : "↓"}</span> : null}
    </th>
  );
  return (
    <section className="view on">
      {superAdmin
        ? <PageHead eyebrow="Users" title={<>Everyone with a <em>key.</em></>} sub="Admins, group admins, client servicing, employees and client logins. Group admin → CS → employee: each person sees the people under them."
          actions={<><button className="btn primary" onClick={() => open(<UserForm />)}><PlusIcon />Add team member</button><button className="btn" onClick={() => open(<UserForm role="client" />)}>Add client login</button></>} />
        : <PageHead eyebrow="Users" title={<>Your <em>group.</em></>} sub="The CS and employees in your group. Add new people, or pick up anyone listed as Unassigned, and choose who they report to."
          actions={<button className="btn primary" onClick={() => open(<UserForm />)}><PlusIcon />Add CS or employee</button>} />}
      {superAdmin
        ? <Stats items={[[users.filter((u) => u.status === "active").length, "Active logins"], [users.filter((u) => u.role !== "client").length, "Team"], [count("client"), "Client logins", "gold"], [groups.length, "Groups"], [deptCount, "Departments"], [users.filter((u) => u.last === "invite pending").length, "Invites pending"]]} />
        : <Stats items={[[users.filter((u) => u.role === "cs" && !u.unassigned).length, "Client servicing"], [users.filter((u) => u.role === "employee" && !u.unassigned).length, "Employees", "gold"], [users.filter((u) => u.unassigned).length, "Unassigned · can join"], [users.filter((u) => u.role === "employee" && !u.unassigned && !u.fields.reportsToId).length, "Employees without a CS"], [users.filter((u) => u.last === "invite pending").length, "Invites pending"]]} />}
      <div className="bar">
        <Chips value={f} onChange={setF} items={superAdmin
          ? [["All", users.length], ["Admins", count("admin")], ["Group admins", count("group_admin")], ["Client servicing", count("cs")], ["Employees", count("employee")], ["Clients", count("client")], ["Inactive", users.filter((u) => u.status === "inactive").length]]
          : [["All", users.length], ["Client servicing", users.filter((u) => u.role === "cs" && !u.unassigned).length], ["Employees", users.filter((u) => u.role === "employee" && !u.unassigned).length], ["Unassigned", users.filter((u) => u.unassigned).length], ["Inactive", users.filter((u) => u.status === "inactive").length]]} />
        {superAdmin && groups.length ? <select className="flt" value={grp} onChange={(e) => setGrp(e.target.value)} aria-label="Filter by group">{["All groups", ...groups, "No group"].map((g) => <option key={g}>{g}</option>)}</select> : null}
        <Search value={q} onChange={setQ} placeholder="Search name, email, login, designation" />
        <button type="button" className="btn" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => exportCsv(rows)} title="Download the rows shown as a CSV">Export CSV · {rows.length}</button>
      </div>
      <div className="scroll"><table className="tbl fit people"><thead><tr><Th k="name">User</Th><Th k="role">Role</Th>{superAdmin ? <Th k="group">Group · reports to</Th> : null}<Th k="dept">Department · designation</Th><th>Contact</th><th className="hide-lg">Last sign-in</th><th>Status</th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id} onClick={() => openUser(u)}>
            <td className="n"><span className="bar" style={{ gap: 10, flexWrap: "nowrap" }}><span className={`ava ${roleClass(u.role)}`} style={{ overflow: "hidden" }}>{u.photo ? <img src={u.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : ini(u.name)}</span><span style={{ minWidth: 0 }}>{u.name}<small>{u.email}</small><small style={{ color: "var(--faint)" }}>login · {u.login}</small></span></span></td>
            <td><span className="tag" style={{ whiteSpace: "nowrap" }}>{ROLE_LABEL[u.role]}</span></td>
            {superAdmin ? <td style={{ color: "var(--muted)" }}>{u.role === "client" ? "—" : u.unassigned ? <Pill cls="dim">Unassigned</Pill> : <>{u.group || "—"}{u.reportsTo ? <span className="sub">→ {u.reportsTo}</span> : null}</>}</td> : null}
            <td>{u.dept}{u.desig && u.desig !== u.dept ? <span className="sub">{u.desig}</span> : null}</td>
            <td className="nowrap" style={{ color: "var(--muted)" }}>{u.mobile || "—"}</td>
            <td className="nowrap hide-lg" style={{ color: u.last === "invite pending" ? "var(--gold)" : "var(--muted)", fontSize: 12 }}>{u.last}</td>
            <td><Pill cls={u.status === "active" ? "gold" : "dim"}>{u.status === "active" ? "Active" : "Inactive"}</Pill></td>
          </tr>
        ))}</tbody></table>
        {!rows.length ? <div className="empty">Nobody matches.</div> : null}
      </div>
    </section>
  );
}

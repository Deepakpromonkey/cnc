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

export function PeopleView({ users, deptCount, groups, superAdmin }: { users: UserVM[]; deptCount: number; groups: string[]; superAdmin: boolean }) {
  const { open } = useUi();
  const [f, setF] = useState("All");
  const [grp, setGrp] = useState("All groups");
  const [q, setQ] = useState("");
  const openUser = useLiveDrawer(users, (u) => <UserDrawer u={u} />, "user");
  const map: Record<string, string> = { Admins: "admin", "Group admins": "group_admin", "Client servicing": "cs", Employees: "employee", Clients: "client" };
  const rows = useMemo(() => users.filter((u) => {
    if (f === "Inactive") { if (u.status !== "inactive") return false; }
    else if (f === "Unassigned") { if (!u.unassigned) return false; }
    else if (!superAdmin && f !== "All" && u.unassigned) return false;
    else if (map[f] && u.role !== map[f]) return false;
    if (grp !== "All groups" && (grp === "No group" ? !!u.group || u.role === "client" : u.group !== grp)) return false;
    const s = q.toLowerCase();
    return !s || `${u.name} ${u.email} ${u.desig} ${u.dept} ${u.group} ${u.reportsTo}`.toLowerCase().includes(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [users, f, q, grp, superAdmin]);
  const count = (r: string) => users.filter((u) => u.role === r).length;
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
        {superAdmin && groups.length ? <select value={grp} onChange={(e) => setGrp(e.target.value)} style={{ width: "auto" }}>{["All groups", ...groups, "No group"].map((g) => <option key={g}>{g}</option>)}</select> : null}
        <Search value={q} onChange={setQ} placeholder="Search name, email, designation" />
      </div>
      <div className="scroll"><table className="tbl tight"><thead><tr><th>User</th><th>Role</th><th>Group · reports to</th><th>Department</th><th>Designation</th><th>Mobile · WhatsApp</th><th>Login ID</th><th>Status</th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id} onClick={() => openUser(u)}>
            <td className="n"><span className="bar" style={{ gap: 10, flexWrap: "nowrap" }}><span className={`ava ${roleClass(u.role)}`} style={{ overflow: "hidden" }}>{u.photo ? <img src={u.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : ini(u.name)}</span><span>{u.name}<small>{u.email}</small></span></span></td>
            <td><span className="tag">{ROLE_LABEL[u.role]}</span></td>
            <td style={{ color: "var(--muted)" }}>{u.role === "client" ? "—" : u.unassigned ? <Pill cls="dim">Unassigned</Pill> : <>{u.group || "—"}{u.reportsTo ? <small>→ {u.reportsTo}</small> : null}</>}</td>
            <td style={{ color: "var(--muted)" }}>{u.dept}</td><td>{u.desig}</td><td style={{ color: "var(--muted)" }}>{u.mobile}</td><td style={{ color: "var(--muted)" }}>{u.login}</td>
            <td><Pill cls={u.status === "active" ? "gold" : "dim"}>{u.status === "active" ? "Active" : "Inactive"}</Pill></td>
          </tr>
        ))}</tbody></table>
        {!rows.length ? <div className="empty">Nobody matches.</div> : null}
      </div>
    </section>
  );
}

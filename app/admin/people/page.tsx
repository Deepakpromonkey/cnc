import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { name, teamScope } from "@/lib/queries";
import { fileUrl } from "@/lib/storage";
import { dateKey, fmtAgo, fmtDate, istMonthDate } from "@/lib/time";
import { FLAG_CLASS } from "@/lib/status";
import { PeopleView, type UserVM } from "@/components/admin/people-view";

export const metadata = { title: "Users & access" };

export default async function PeoplePage() {
  const me = await requireUser(["admin", "group_admin"]);
  const team = await teamScope(me);
  const month = istMonthDate();
  const [users, depts] = await Promise.all([
    db.user.findMany({
      // A group admin sees their group (incl. themselves); the super admin sees every login.
      // Group admins also see unassigned CS/employees so they can add them to their group.
      where: team ? { OR: [{ id: { in: team } }, { groupId: null, role: { in: ["cs", "employee"] }, status: "active" }] } : {},
      include: {
        department: true, brand: true, group: true, reportsTo: true, _count: { select: { reports: true } }, scores: { where: { month } }, flagsReceived: { where: { month }, include: { type: true } },
        assignments: { include: { task: { include: { status: true } } } },
      },
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
    }),
    db.department.count({ where: { status: "active" } }),
  ]);
  const vms: UserVM[] = users.map((u) => ({
    id: u.id, name: name(u), role: u.role, status: u.status, email: u.email, login: u.loginId, dept: u.role === "client" ? u.brand?.name ?? "" : u.department?.name ?? "",
    desig: u.designation ?? "", mobile: u.mobile ?? "", photo: fileUrl(u.photoFileId, "320"), last: u.lastLoginAt ? fmtAgo(u.lastLoginAt) : u.passwordHash ? "never" : "invite pending",
    flags: u.flagsReceived.map((f) => FLAG_CLASS[f.type.colour]), score: u.scores[0]?.score ?? null,
    group: u.group?.name ?? "", groupId: u.groupId, reportsTo: u.reportsTo ? name(u.reportsTo) : "", reports: u._count.reports,
    manageable: me.role === "admin" || (u.id !== me.id && (u.role === "cs" || u.role === "employee")),
    unassigned: me.role === "group_admin" && !u.groupId,
    tasks: u.assignments.length, open: u.assignments.filter((a) => !a.task.status.isDone).length,
    fields: {
      firstName: u.firstName, lastName: u.lastName, role: u.role, brandId: u.brandId, departmentId: u.departmentId, designation: u.designation, gender: u.gender,
      dob: dateKey(u.dob), email: u.email, loginId: u.loginId, mobile: u.mobile, whatsappNo: u.whatsappNo, personalEmail: u.personalEmail, personalContact: u.personalContact,
      address: u.address, city: u.city, state: u.state, pincode: u.pincode, country: u.country, linkedin: u.linkedin, facebook: u.facebook, instagram: u.instagram, status: u.status,
      groupId: u.groupId, reportsToId: u.reportsToId,
    },
    dobLabel: u.dob ? fmtDate(u.dob) : "",
  }));
  const groups = me.role === "admin" ? (await db.teamGroup.findMany({ where: { status: "active" }, orderBy: { name: "asc" } })).map((g) => g.name) : [];
  return <PeopleView users={vms} deptCount={depts} groups={groups} superAdmin={me.role === "admin"} />;
}

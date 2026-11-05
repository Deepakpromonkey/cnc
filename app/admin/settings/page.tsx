import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { istMonthDate } from "@/lib/time";
import { rupees } from "@/lib/money";
import { razorpayLive } from "@/lib/razorpay";
import { SettingsView } from "@/components/admin/settings-view";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser(["admin"]);
  const month = istMonthDate();
  const [company, roles, statusUse, flagUse, depts, scope, titles, servicing, groups] = await Promise.all([
    db.company.findFirstOrThrow(),
    db.user.groupBy({ by: ["role"], where: { status: "active" }, _count: true }),
    db.task.groupBy({ by: ["statusId"], _count: true }),
    db.flag.groupBy({ by: ["flagTypeId"], where: { month }, _count: true }),
    db.department.findMany({ orderBy: { order: "asc" } }),
    db.scopeOfWork.findMany({ orderBy: { name: "asc" } }),
    db.taskTitle.findMany({ orderBy: { name: "asc" } }),
    db.servicingType.findMany({ orderBy: { name: "asc" } }),
    db.teamGroup.findMany({ orderBy: { name: "asc" }, include: { members: { where: { status: "active" }, select: { role: true, firstName: true, lastName: true } } } }),
  ]);
  const list = (rows: { id: string; name: string; status: string }[]) => rows.map((r) => ({ id: r.id, name: r.name, status: r.status }));
  return (
    <SettingsView
      company={{ legalName: company.legalName, brandName: company.brandName, gstin: company.gstin ?? "", address: company.address ?? "", city: company.city ?? "", state: company.state ?? "", pincode: company.pincode ?? "", portalUrl: company.portalUrl ?? "", studioHoursStart: company.studioHoursStart, studioHoursEnd: company.studioHoursEnd, lateLoginAfter: company.lateLoginAfter, workingDays: company.workingDays }}
      roles={Object.fromEntries(roles.map((r) => [r.role, r._count]))}
      statusUse={Object.fromEntries(statusUse.map((s) => [s.statusId, s._count]))}
      flagUse={Object.fromEntries(flagUse.map((f) => [f.flagTypeId, f._count]))}
      depts={list(depts)} titles={list(titles)} scope={scope.map((s) => ({ id: s.id, name: s.name, status: s.status, rate: s.defaultRatePaise ? String(rupees(s.defaultRatePaise)) : "" }))}
      groups={groups.map((g) => ({ id: g.id, name: g.name, status: g.status, heads: g.members.filter((m) => m.role === "group_admin").map((m) => `${m.firstName} ${m.lastName}`.trim()), cs: g.members.filter((m) => m.role === "cs").length, employees: g.members.filter((m) => m.role === "employee").length }))}
      servicing={servicing.map((s) => ({ id: s.id, name: s.name, status: s.status, short: s.shortDescription ?? "" }))}
      integrations={{ sarthi: !!process.env.SARTHI_WEBHOOK_URL, razorpay: razorpayLive(), smtp: !!process.env.SMTP_HOST }}
    />
  );
}

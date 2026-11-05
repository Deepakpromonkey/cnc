import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { settingValue } from "@/lib/queries";
import { DAY_MS, fmtTime, fmtWhen, istStartOfDay } from "@/lib/time";
import { SarthiView } from "@/components/admin/sarthi-view";

export const metadata = { title: "Sarthi" };

const AUTOS: [string, string, string][] = [
  ["digest", "Daily client digest", "9:00 am · what moved, what's waiting on them"],
  ["nudges", "Overdue nudges to employees", "Every 2 h while a task is late · goes to the person, copies CS"],
  ["qa", "Answer status questions", "Admins and CS heads can ask anything on WhatsApp"],
  ["invoice_reminders", "Invoice reminders", "3 days before due, on due date, then every 5 days"],
  ["eod_chaser", "EOD report chaser", "7:30 pm if no EOD log for an active task"],
  ["weekly_note", "Weekly performance note to admin", "Monday 9:00 am · movers and red flags"],
];

/** One-line, human summary of an outbox event for the log. */
function describe(event: string, p: Record<string, unknown>) {
  const t = (p.task as { name?: string })?.name, b = typeof p.brand === "string" ? p.brand : (p.brand as { name?: string })?.name;
  const inv = (p.invoice as { number?: string })?.number;
  switch (event) {
    case "task.status.changed": return `${b ?? ""} · ${t} → ${p.to}`;
    case "task.rejected": return `Rejection note to ${(p.assignees as { name: string }[])?.map((a) => a.name.split(" ")[0]).join(" & ")} · ${t}`;
    case "task.assigned": return `New task for ${(p.assignees as { name: string }[])?.map((a) => a.name.split(" ")[0]).join(" & ")} · ${t}`;
    case "task.nudge": case "task.late": return `Nudge · ${t}`;
    case "approval.reminder": return `Approval reminder to ${b} · ${t}`;
    case "invoice.sent": case "invoice.paid": case "invoice.reminder": case "invoice.overdue": case "invoice.viewed": return `${event.split(".")[1]} · ${inv} · ${b ?? ""}`;
    case "request.created": case "request.replied": return `${event === "request.created" ? "New request" : "Reply"} · ${b} · ${(p.request as { subject?: string })?.subject}`;
    case "eod.missing": return `EOD chase · ${(p.user as { name?: string })?.name ?? ""}`;
    default: return event.replace(/\./g, " ");
  }
}

export default async function SarthiPage() {
  const u = await requireUser(["admin"]);
  const dayStart = istStartOfDay();
  const [qa, events, autos, access] = await Promise.all([
    db.auditLog.findMany({ where: { action: "agent.answer", at: { gte: new Date(dayStart.getTime() - 6 * DAY_MS) } }, orderBy: { at: "asc" }, take: 40 }),
    db.eventOutbox.findMany({ where: { createdAt: { gte: dayStart } }, orderBy: { createdAt: "desc" }, take: 60 }),
    settingValue<Record<string, boolean>>("sarthi_automations", {}),
    db.agentAccess.findFirst({ where: { agentName: "sarthi" } }),
  ]);
  const askers = new Map((await db.user.findMany({ where: { id: { in: qa.map((q) => q.actorUserId!).filter(Boolean) } } })).map((x) => [x.id, x.firstName]));
  return (
    <SarthiView
      me={u.firstName}
      chat={qa.flatMap((q) => {
        const a = q.after as { question: string; answer: string; source?: string };
        return [
          { kind: "q" as const, who: `${askers.get(q.actorUserId ?? "") ?? "Team"} · ${fmtWhen(q.at)}`, text: a.question },
          { kind: "a" as const, who: `Sarthi · ${fmtTime(q.at)}${a.source === "local" ? " · read from the CRM" : ""}`, text: a.answer },
        ];
      })}
      autos={AUTOS.map(([k, label, sub]) => ({ k, label, sub, on: autos[k] ?? k !== "weekly_note" }))}
      log={events.map((e) => ({ at: fmtTime(e.createdAt), text: describe(e.event, e.payload as Record<string, unknown>), delivered: !!e.deliveredAt, attempts: e.attempts }))}
      connected={!!process.env.SARTHI_WEBHOOK_URL} api={!!process.env.SARTHI_API_URL}
      queries={((access?.allowedQueries ?? []) as { name: string; params: string[] }[]).map((q) => `${q.name}(${q.params.join(", ")})`)}
    />
  );
}

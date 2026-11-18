import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canSeeTask, name } from "@/lib/queries";

const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** "Add to calendar": a one-event .ics for the task's deadline (1 h block ending at the deadline). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new NextResponse("Sign in", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const t = await db.task.findUnique({ where: { id }, include: { brand: true, cs: true, status: true, assignees: { include: { user: true } } } });
  if (!t || !(await canSeeTask(u, t))) return new NextResponse("Not found", { status: 404 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const link = u.role === "client" ? `${origin}/client/work?piece=${t.id}` : u.role === "admin" || u.role === "group_admin" ? `${origin}/admin/tasks?task=${t.id}` : `${origin}/team/tasks?task=${t.id}`;
  const who = t.assignees.map((a) => name(a.user)).join(", ");
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Coffee & Creative//CNC CRM//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:task-${t.id}@cnc-crm`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(new Date(t.deadlineAt.getTime() - 3600_000))}`,
    `DTEND:${ics(t.deadlineAt)}`,
    `SUMMARY:${esc(`Deadline · ${t.name} · ${t.brand.name}`)}`,
    `DESCRIPTION:${esc(`T-${t.code} · ${t.status.name}\nAssigned: ${who || "—"}\nCS: ${name(t.cs)}\n${t.description ?? ""}\n${link}`)}`,
    `URL:${link}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Due in 2 h: ${t.name}`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="T-${t.code}.ics"`, "Cache-Control": "private, no-store" } });
}

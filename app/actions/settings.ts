"use server";
import type { FlagColour, Prisma, ScoreParameter, Tone } from "@prisma/client";
import { db } from "@/lib/db";
import { actor } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { toPaise } from "@/lib/money";
import { fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { istMonthDate } from "@/lib/time";

const TONES: Tone[] = ["neutral", "crimson", "gold", "muted"];
const COLOURS: FlagColour[] = ["gold", "crimson", "cream", "muted"];

// ---------- task statuses (§6.2) ----------
export async function saveStatus(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = opt(fd, "id");
    const name = str(fd, "name");
    const tone = (TONES.includes(str(fd, "tone") as Tone) ? str(fd, "tone") : "neutral") as Tone;
    if (!name) return fail("Give it a name");
    const all = await db.taskStatus.findMany({ orderBy: { order: "asc" } });
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== id)) return fail("That name is taken");
    if (id) {
      const s = all.find((x) => x.id === id)!;
      // Start and done are fixed ends: recolour only (§6.2 / mockup copy).
      const data = s.isStart || s.isDone ? { tone } : { name, tone };
      await db.taskStatus.update({ where: { id }, data });
      await audit(db, u, "status.updated", "task_status", id, { name: s.name, tone: s.tone }, data);
      return ok("Saved");
    }
    const after = Number(str(fd, "position"));
    const pos = Math.min(Math.max(1, after || all.length - 1), all.length - 1); // never after done
    await db.$transaction(async (tx) => {
      for (const s of all.filter((s) => s.order >= pos).reverse()) await tx.taskStatus.update({ where: { id: s.id }, data: { order: s.order + 1 } });
      const s = await tx.taskStatus.create({ data: { name, tone, order: pos } });
      await audit(tx, u, "status.created", "task_status", s.id, undefined, { name, tone, order: pos });
    });
    return ok("Status added · shows on the board now");
  });
}

export async function removeStatus(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const s = await db.taskStatus.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (s.isStart || s.isDone) return fail("New and Completed are fixed ends");
    const used = (await db.task.count({ where: { statusId: s.id } })) + (await db.project.count({ where: { statusId: s.id } }));
    if (used) return fail(`${used} task${used > 1 ? "s" : ""}/project${used > 1 ? "s" : ""} sit here. Move them first.`);
    const hist = await db.taskStatusHistory.count({ where: { OR: [{ toStatusId: s.id }, { fromStatusId: s.id }] } });
    if (hist) await db.taskStatus.update({ where: { id: s.id }, data: { status: "inactive", order: 999 } });
    else await db.taskStatus.delete({ where: { id: s.id } });
    await audit(db, u, "status.removed", "task_status", s.id, { name: s.name });
    return ok("Removed");
  });
}

export async function moveStatus(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const all = await db.taskStatus.findMany({ where: { status: "active" }, orderBy: { order: "asc" } });
    const i = all.findIndex((s) => s.id === str(fd, "id"));
    const j = i + (str(fd, "dir") === "left" ? -1 : 1);
    if (i < 0 || j <= 0 || j >= all.length - 1 || all[i].isStart || all[i].isDone) return fail("New and Completed stay at the ends");
    await db.$transaction([
      db.taskStatus.update({ where: { id: all[i].id }, data: { order: all[j].order } }),
      db.taskStatus.update({ where: { id: all[j].id }, data: { order: all[i].order } }),
    ]);
    await audit(db, u, "status.reordered", "task_status", all[i].id);
    return ok("Moved");
  });
}

// ---------- flag types (§6.6) ----------
export async function saveFlagType(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = opt(fd, "id");
    const name = str(fd, "name");
    if (!name) return fail("Give it a name");
    const data = { name, colour: (COLOURS.includes(str(fd, "colour") as FlagColour) ? str(fd, "colour") : "cream") as FlagColour, points: Math.trunc(Number(str(fd, "points")) || 0), note: opt(fd, "note") };
    const f = id ? await db.flagType.update({ where: { id }, data }) : await db.flagType.create({ data });
    await audit(db, u, id ? "flagtype.updated" : "flagtype.created", "flag_type", f.id, undefined, data);
    return ok(id ? "Saved" : "Flag added");
  });
}

export async function removeFlagType(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const id = str(fd, "id");
    const used = await db.flag.count({ where: { flagTypeId: id, month: istMonthDate() } });
    if (used) return fail(`${used} given this month — rename it instead`);
    const ever = await db.flag.count({ where: { flagTypeId: id } });
    if (ever) await db.flagType.update({ where: { id }, data: { status: "inactive" } });
    else await db.flagType.delete({ where: { id } });
    await audit(db, u, "flagtype.removed", "flag_type", id);
    return ok("Removed");
  });
}

// ---------- simple lists ----------
export async function saveListItem(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const kind = str(fd, "kind"), id = opt(fd, "id"), name = str(fd, "name");
    if (!name) return fail("Name is required");
    const status = str(fd, "status") === "inactive" ? "inactive" : "active";
    let row: { id: string };
    if (kind === "dept") row = id ? await db.department.update({ where: { id }, data: { name, status } }) : await db.department.create({ data: { name, order: await db.department.count() } });
    else if (kind === "scope") {
      const rate = str(fd, "rate") ? toPaise(str(fd, "rate")) : null;
      row = id ? await db.scopeOfWork.update({ where: { id }, data: { name, status, defaultRatePaise: rate } }) : await db.scopeOfWork.create({ data: { name, defaultRatePaise: rate } });
    } else if (kind === "title") row = id ? await db.taskTitle.update({ where: { id }, data: { name, status } }) : await db.taskTitle.create({ data: { name } });
    else if (kind === "group") {
      if (id && status === "inactive" && (await db.user.count({ where: { groupId: id, status: "active" } }))) return fail("Move its active members to another group first");
      row = id ? await db.teamGroup.update({ where: { id }, data: { name, status } }) : await db.teamGroup.create({ data: { name, createdBy: u.id } });
    }
    else if (kind === "servicing") row = id ? await db.servicingType.update({ where: { id }, data: { name, status, shortDescription: opt(fd, "short"), description: opt(fd, "description") } }) : await db.servicingType.create({ data: { name, shortDescription: opt(fd, "short"), description: opt(fd, "description") } });
    else return fail("Unknown list");
    await audit(db, u, `${kind}.${id ? "updated" : "created"}`, kind, row.id, undefined, { name, status });
    return ok(id ? "Saved" : "Added");
  });
}

export async function saveCompany(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const c = await db.company.findFirstOrThrow();
    const days = fd.getAll("workingDays").map(Number).filter((n) => n >= 1 && n <= 7);
    const data = {
      legalName: str(fd, "legalName") || c.legalName, brandName: str(fd, "brandName") || c.brandName, gstin: opt(fd, "gstin"), address: opt(fd, "address"),
      city: opt(fd, "city"), state: opt(fd, "state"), pincode: opt(fd, "pincode"), portalUrl: opt(fd, "portalUrl"),
      studioHoursStart: str(fd, "studioHoursStart") || c.studioHoursStart, studioHoursEnd: str(fd, "studioHoursEnd") || c.studioHoursEnd,
      lateLoginAfter: str(fd, "lateLoginAfter") || c.lateLoginAfter, workingDays: days.length ? days : c.workingDays,
    };
    await db.company.update({ where: { id: c.id }, data });
    await audit(db, u, "company.updated", "company", c.id, c, data);
    return ok("Saved");
  });
}

export async function saveWeights(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const rows = await db.scoringWeight.findMany();
    for (const r of rows) {
      const w = Math.max(0, Math.min(100, Math.trunc(Number(str(fd, `w_${r.parameter}`)) || 0)));
      const enabled = str(fd, `e_${r.parameter}`) === "on";
      await db.scoringWeight.update({ where: { parameter: r.parameter as ScoreParameter }, data: { weight: w, enabled } });
    }
    const set = async (key: string, v: number) => db.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
    if (str(fd, "praise_cs")) await set("praise_cs_points", Number(str(fd, "praise_cs")));
    if (str(fd, "praise_admin")) await set("praise_admin_points", Number(str(fd, "praise_admin")));
    await db.setting.upsert({ where: { key: "score_visible_to_employee" }, create: { key: "score_visible_to_employee", value: str(fd, "visible") === "on" }, update: { value: str(fd, "visible") === "on" } });
    await audit(db, u, "scoring.weights.updated", "scoring_weight", null, rows, Object.fromEntries(fd.entries()));
    return ok("Weights saved · applied at tonight's 00:30 run");
  });
}

// ---------- Sarthi automations (§10.5) ----------
export async function setAutomation(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const key = str(fd, "key"), on = str(fd, "value") === "on" || str(fd, "value") === "true";
    const cur = ((await db.setting.findUnique({ where: { key: "sarthi_automations" } }))?.value ?? {}) as Record<string, boolean>;
    const next = { ...cur, [key]: on };
    await db.setting.upsert({ where: { key: "sarthi_automations" }, create: { key: "sarthi_automations", value: next }, update: { value: next as Prisma.InputJsonValue } });
    const api = process.env.SARTHI_API_URL;
    if (api) {
      await fetch(`${api.replace(/\/$/, "")}/customers/cnc/automations`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SARTHI_WEBHOOK_SECRET}` }, body: JSON.stringify(next), signal: AbortSignal.timeout(8000) }).catch(() => null);
    }
    await audit(db, u, "sarthi.automation", "setting", "sarthi_automations", cur, next);
    await emit(db, "sarthi.automations.changed", { automations: next });
    return ok(on ? "On" : "Off");
  });
}

"use server";
import type { Frequency, Gender, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { actor, fullName } from "@/lib/auth";
import { audit, emit } from "@/lib/events";
import { assertBrand, assertPerson } from "@/lib/tasks";
import { cleanUrl, filesFrom, saveImage } from "@/lib/storage";
import { all, fail, guard, ok, opt, str, type Result } from "@/lib/result";
import { dateOnly } from "@/lib/time";
import { sendResetLink } from "./common";

const FREQ: Frequency[] = ["monthly_retainer", "quarterly", "yearly", "project_based"];
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------- brands (§4.2, every column) ----------
export async function saveBrand(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin", "cs"]);
    const id = opt(fd, "id");
    if (u.role !== "admin" && !id) return fail("Only admin can add brands");
    if (id) await assertBrand(u, id);
    const name = str(fd, "name");
    if (!name) return fail("Brand name is required");
    const website = opt(fd, "website"), other = opt(fd, "otherSocialLink");
    if (website && !cleanUrl(website)) return fail("Website doesn't look like a web address");
    const contact = {
      officialEmail: opt(fd, "officialEmail"), whatsapp: opt(fd, "whatsapp"), pocName: opt(fd, "pocName"), pocPhone: opt(fd, "pocPhone"),
    };
    // CS may edit contact fields of their own brands only (§3).
    const full = u.role === "admin" ? {
      name, companyName: opt(fd, "companyName"), division: opt(fd, "division"), address: opt(fd, "address"), city: opt(fd, "city"), state: opt(fd, "state"),
      pincode: opt(fd, "pincode"), country: opt(fd, "country") ?? "India", frequency: (FREQ.includes(str(fd, "frequency") as Frequency) ? str(fd, "frequency") : "monthly_retainer") as Frequency,
      paymentTerms: opt(fd, "paymentTerms"), website, twitter: opt(fd, "twitter"), linkedin: opt(fd, "linkedin"), facebook: opt(fd, "facebook"),
      instagram: opt(fd, "instagram"), otherSocialLink: other, vatNumber: opt(fd, "vatNumber"), gstin: opt(fd, "gstin")?.toUpperCase() ?? null,
      additionalInformation: opt(fd, "additionalInformation"), sinceYear: Number(str(fd, "sinceYear")) || null, feeNote: opt(fd, "feeNote"),
      status: (str(fd, "status") === "inactive" ? "inactive" : "active") as "active" | "inactive",
    } : {};
    const logo = filesFrom(fd, "logo")[0];
    const logoFile = logo ? await saveImage(logo, "brand_logo", u.id) : null;
    const cs = all(fd, "cs"), scope = all(fd, "scope");
    const loginEmail = opt(fd, "loginEmail")?.toLowerCase() ?? null;
    if (loginEmail && !emailOk(loginEmail)) return fail("Login email doesn't look right");

    const b = await db.$transaction(async (tx) => {
      const before = id ? await tx.brand.findUnique({ where: { id } }) : null;
      const data = { ...contact, ...full, ...(logoFile ? { logoFileId: logoFile.id } : {}) };
      const b = id ? await tx.brand.update({ where: { id }, data }) : await tx.brand.create({ data: { ...data, name, createdBy: u.id } as never });
      if (u.role === "admin") {
        if (!cs.length) throw new Error("Pick at least one CS");
        await tx.brandCs.deleteMany({ where: { brandId: b.id } });
        await tx.brandCs.createMany({ data: cs.map((userId, i) => ({ brandId: b.id, userId, isPrimary: i === 0 })) });
        await tx.brandScope.deleteMany({ where: { brandId: b.id } });
        if (scope.length) await tx.brandScope.createMany({ data: scope.map((s) => ({ brandId: b.id, scopeOfWorkId: s })) });
      }
      if (loginEmail && !(await tx.user.findUnique({ where: { email: loginEmail } }))) {
        const [first, ...rest] = (contact.pocName ?? `${name} Team`).split(" ");
        const c = await tx.user.create({ data: { firstName: first, lastName: rest.join(" "), email: loginEmail, loginId: loginEmail, role: "client", brandId: b.id, mobile: contact.pocPhone, whatsappNo: contact.whatsapp ?? contact.pocPhone, invitedAt: new Date(), createdBy: u.id } });
        await audit(tx, u, "user.invited", "user", c.id, undefined, { role: "client", brandId: b.id });
      }
      await audit(tx, u, id ? "brand.updated" : "brand.created", "brand", b.id, before ?? undefined, data);
      return b;
    });
    if (loginEmail) {
      const c = await db.user.findUnique({ where: { email: loginEmail } });
      if (c && !c.passwordHash) await sendResetLink(c.id);
    }
    return ok(id ? "Saved" : `${b.name} added`, { id: b.id });
  });
}

export async function addClientLogin(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin"]);
    const brandId = str(fd, "brandId");
    const email = str(fd, "email").toLowerCase();
    if (!emailOk(email)) return fail("Enter a valid email");
    if (await db.user.findUnique({ where: { email } })) return fail("That email already has a login");
    const [first, ...rest] = (str(fd, "name") || email.split("@")[0]).split(" ");
    const c = await db.user.create({ data: { firstName: first, lastName: rest.join(" "), email, loginId: email, role: "client", brandId, mobile: opt(fd, "mobile"), whatsappNo: opt(fd, "mobile"), invitedAt: new Date(), createdBy: u.id } });
    await audit(db, u, "user.invited", "user", c.id, undefined, { role: "client", brandId });
    await sendResetLink(c.id);
    await emit(db, "user.invited", { user: { name: fullName(c), whatsapp: c.whatsappNo, role: "client" } });
    return ok(`Invite sent to ${email}`);
  });
}

// ---------- users (§4.1, every column) ----------
const ROLE: Record<string, Role> = { Employee: "employee", "Client servicing": "cs", Admin: "admin", "Group admin": "group_admin", Client: "client", employee: "employee", cs: "cs", admin: "admin", group_admin: "group_admin", client: "client" };

/**
 * Hierarchy (client request 2026-11-04): group admin → CS → employee.
 * Returns the group + manager to store, or an error. Group admins can only place people in their own group.
 */
async function placeInHierarchy(u: { id: string; role: Role; groupId: string | null }, role: Role, fd: FormData, editingId: string | null) {
  if (role === "admin" || role === "client") return { groupId: null, reportsToId: null };
  const groupId = u.role === "group_admin" ? u.groupId : opt(fd, "groupId");
  if (u.role === "group_admin" && !groupId) return { error: "Your login isn't attached to a group yet — ask the admin" };
  if (groupId && !(await db.teamGroup.findFirst({ where: { id: groupId, status: "active" } }))) return { error: "Pick an active group" };
  if (role === "group_admin") return groupId ? { groupId, reportsToId: null } : { error: "A group admin needs a group" };
  const reportsToId = opt(fd, "reportsToId");
  if (!reportsToId) return { groupId, reportsToId: null };
  if (reportsToId === editingId) return { error: "Someone can't report to themselves" };
  const boss = await db.user.findUnique({ where: { id: reportsToId } });
  if (!boss || boss.status !== "active") return { error: "Pick an active person to report to" };
  if (role === "employee" && boss.role !== "cs" && boss.role !== "group_admin") return { error: "Employees report to a CS or their group admin" };
  if (role === "cs" && boss.role !== "group_admin") return { error: "CS report to a group admin" };
  if (boss.groupId !== groupId) return { error: "They report to someone outside their group" };
  return { groupId, reportsToId };
}

export async function saveUser(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin"]);
    const id = opt(fd, "id");
    const role = ROLE[str(fd, "role")] ?? "employee";
    if (u.role === "group_admin") {
      if (role !== "cs" && role !== "employee") return fail("Group admins add CS and employees only");
      if (id === u.id) return fail("Ask the admin to change your own access");
      if (id) {
        const target = await db.user.findUniqueOrThrow({ where: { id } });
        if (target.role !== "cs" && target.role !== "employee") return fail("You can only edit CS and employees");
        // Unassigned staff can be picked up into the group; anyone in another group can't be touched.
        if (target.groupId !== null) await assertPerson(u, id);
      }
    }
    const place = await placeInHierarchy(u, role, fd, id);
    if ("error" in place) return fail(place.error!);
    const email = str(fd, "email").toLowerCase();
    const firstName = str(fd, "firstName");
    if (!firstName) return fail("First name is required");
    if (!emailOk(email)) return fail("Enter a valid work email");
    const loginId = (opt(fd, "loginId") ?? email).toLowerCase();
    const brandId = role === "client" ? opt(fd, "brandId") : null;
    if (role === "client" && !brandId) return fail("A client login belongs to one brand");
    const clash = await db.user.findFirst({ where: { OR: [{ email }, { loginId }], ...(id ? { id: { not: id } } : {}) } });
    if (clash) return fail("Email or login ID already in use");
    const g = str(fd, "gender").toLowerCase();
    const photo = filesFrom(fd, "photo")[0];
    const photoFile = photo ? await saveImage(photo, "user_photo", u.id) : null;
    const data = {
      firstName, lastName: str(fd, "lastName"), email, loginId, role, brandId, departmentId: role === "client" ? null : opt(fd, "departmentId"),
      designation: opt(fd, "designation"), gender: (["female", "male", "other"].includes(g) ? g : null) as Gender | null,
      dob: opt(fd, "dob") ? dateOnly(str(fd, "dob")) : null, mobile: opt(fd, "mobile"), whatsappNo: opt(fd, "whatsappNo"),
      personalEmail: opt(fd, "personalEmail"), personalContact: opt(fd, "personalContact"), address: opt(fd, "address"), city: opt(fd, "city"),
      state: opt(fd, "state"), pincode: opt(fd, "pincode"), country: opt(fd, "country") ?? "India", linkedin: opt(fd, "linkedin"),
      facebook: opt(fd, "facebook"), instagram: opt(fd, "instagram"), status: (str(fd, "status") === "inactive" ? "inactive" : "active") as "active" | "inactive",
      ...(photoFile ? { photoFileId: photoFile.id } : {}),
      groupId: place.groupId, reportsToId: place.reportsToId,
    };
    if (id) {
      const before = await db.user.findUniqueOrThrow({ where: { id } });
      if (before.id === u.id && (data.role !== "admin" || data.status !== "active")) return fail("You can't demote or deactivate yourself");
      await db.user.update({ where: { id }, data });
      // People who reported to someone now outside their group (or no longer a manager) lose that link.
      if (before.groupId !== data.groupId || before.role !== data.role) {
        await db.user.updateMany({ where: { reportsToId: id, ...(data.role === "cs" || data.role === "group_admin" ? { NOT: { groupId: data.groupId } } : {}) }, data: { reportsToId: null } });
      }
      if (data.status === "inactive") await db.session.deleteMany({ where: { userId: id } });
      await audit(db, u, "user.updated", "user", id, { ...before, passwordHash: undefined }, data);
      return ok("Saved");
    }
    const c = await db.user.create({ data: { ...data, invitedAt: new Date(), createdBy: u.id } });
    await audit(db, u, "user.invited", "user", c.id, undefined, data);
    if (str(fd, "invite") !== "") {
      await sendResetLink(c.id);
      await emit(db, "user.invited", { user: { name: fullName(c), whatsapp: c.whatsappNo, role } });
    }
    return ok(`Invite sent to ${email}`, { id: c.id });
  });
}

export async function setUserStatus(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin"]);
    const id = str(fd, "id");
    const status = str(fd, "status") === "inactive" ? "inactive" : "active";
    if (id === u.id) return fail("You can't deactivate yourself");
    if (u.role === "group_admin") await assertManageable(u, id);
    await db.user.update({ where: { id }, data: { status } });
    if (status === "inactive") await db.session.deleteMany({ where: { userId: id } });
    await audit(db, u, `user.${status === "inactive" ? "deactivated" : "reactivated"}`, "user", id);
    return ok(status === "inactive" ? "Deactivated · signed out everywhere" : "Reactivated");
  });
}

export async function sendUserReset(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor(["admin", "group_admin"]);
    const id = str(fd, "id");
    if (u.role === "group_admin") await assertManageable(u, id);
    const link = await sendResetLink(id);
    await audit(db, u, "user.reset.sent", "user", id);
    return ok(process.env.SMTP_HOST ? "Reset link emailed" : `Reset link (dev, not emailed): ${link}`);
  });
}

export async function updateOwnProfile(fd: FormData): Promise<Result> {
  return guard(async () => {
    const u = await actor();
    const photo = filesFrom(fd, "photo")[0];
    const photoFile = photo ? await saveImage(photo, "user_photo", u.id) : null;
    const data = {
      mobile: opt(fd, "mobile"), whatsappNo: opt(fd, "whatsappNo"), personalEmail: opt(fd, "personalEmail"), personalContact: opt(fd, "personalContact"),
      address: opt(fd, "address"), city: opt(fd, "city"), state: opt(fd, "state"), pincode: opt(fd, "pincode"),
      linkedin: opt(fd, "linkedin"), facebook: opt(fd, "facebook"), instagram: opt(fd, "instagram"), ...(photoFile ? { photoFileId: photoFile.id } : {}),
    };
    await db.user.update({ where: { id: u.id }, data });
    await audit(db, u, "user.profile.updated", "user", u.id, undefined, data);
    return ok("Saved");
  });
}

/** A group admin manages the CS and employees of their own group, nobody else. */
async function assertManageable(u: { id: string; role: Role; brandId: string | null; groupId: string | null }, id: string) {
  await assertPerson(u, id);
  const t = await db.user.findUniqueOrThrow({ where: { id } });
  if (t.role !== "cs" && t.role !== "employee") throw new Error("You can only manage CS and employees");
}

export async function brandIdsFor(userId: string) {
  return (await db.brandCs.findMany({ where: { userId } })).map((b) => b.brandId);
}

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { brandStats } from "@/lib/brand-stats";
import { loadProjects, loadTasks } from "@/lib/views";
import { fileUrl } from "@/lib/storage";
import { fmtAgo } from "@/lib/time";
import { brandScope, name, taskScope } from "@/lib/queries";
import { BrandsView, type BrandVM } from "@/components/admin/brands-view";

export const metadata = { title: "Brands" };

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const u = await requireUser(["admin", "group_admin"]);
  const { b } = await searchParams;
  const [B, T] = await Promise.all([brandScope(u), taskScope(u)]);
  const [stats, rows, tasks] = await Promise.all([
    brandStats(B ?? undefined),
    db.brand.findMany({ where: B ? { id: { in: B } } : {}, include: { scope: { include: { scope: true } }, clientUsers: true, _count: { select: { projects: true, tasks: true } } } }),
    loadTasks(T),
  ]);
  const projects = await loadProjects(B ? { brandId: { in: B } } : {}, tasks);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const brands: BrandVM[] = stats.map((s) => {
    const r = byId.get(s.id)!;
    const bt = tasks.filter((t) => t.brandId === s.id);
    return {
      ...s, logo: fileUrl(r.logoFileId, "320"),
      profile: {
        id: r.id, name: r.name, companyName: r.companyName, division: r.division, address: r.address, city: r.city, state: r.state, pincode: r.pincode, country: r.country,
        frequency: r.frequency, paymentTerms: r.paymentTerms, officialEmail: r.officialEmail, whatsapp: r.whatsapp, website: r.website, twitter: r.twitter,
        linkedin: r.linkedin, facebook: r.facebook, instagram: r.instagram, otherSocialLink: r.otherSocialLink, pocName: r.pocName, pocPhone: r.pocPhone,
        vatNumber: r.vatNumber, gstin: r.gstin, additionalInformation: r.additionalInformation, sinceYear: r.sinceYear ? String(r.sinceYear) : "", feeNote: r.feeNote, status: r.status,
      },
      scopeIds: r.scope.map((x) => x.scopeOfWorkId), scopeNames: r.scope.map((x) => x.scope.name),
      clients: r.clientUsers.map((c) => ({ id: c.id, name: name(c), email: c.email, status: c.status, last: c.lastLoginAt ? fmtAgo(c.lastLoginAt) : "never signed in", invited: !c.passwordHash })),
      counts: { projects: r._count.projects, tasks: bt.length, notStarted: bt.filter((t) => t.status.isStart).length, done: bt.filter((t) => t.status.isDone).length },
    };
  });
  return <BrandsView brands={brands} tasks={tasks.filter((t) => !t.status.isDone)} projects={projects} initial={b ?? null} />;
}

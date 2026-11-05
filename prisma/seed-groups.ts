// Optional demo of the group hierarchy (client request 2026-11-04): run after `npm run db:seed`.
//   npm run db:seed-groups
// Creates "Studio A" with a demo group admin (login `ga-demo`, password = DEMO_GROUP_PASSWORD or SEED_PASSWORD),
// two CS reporting to the group admin, and four employees split under those CS. Idempotent.
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

async function main() {
  // DEMO_GROUP_PASSWORD lets a tester give only the demo login its own password.
  const password = process.env.DEMO_GROUP_PASSWORD || process.env.SEED_PASSWORD;
  if (!password) throw new Error("Set SEED_PASSWORD in .env");
  const pwHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const group = await db.teamGroup.upsert({ where: { name: "Studio A" }, create: { name: "Studio A" }, update: { status: "active" } });
  const dept = await db.department.findFirst({ where: { name: { contains: "Management", mode: "insensitive" } } });
  const ga = await db.user.upsert({
    where: { loginId: "ga-demo" },
    create: {
      firstName: "Demo", lastName: "Group Admin", email: "ga-demo@coffeeandcreative.in", loginId: "ga-demo", role: "group_admin",
      passwordHash: pwHash,
      groupId: group.id, departmentId: dept?.id, designation: "Group admin · Studio A",
    },
    update: { role: "group_admin", groupId: group.id, status: "active", ...(process.env.DEMO_GROUP_PASSWORD ? { passwordHash: pwHash } : {}) },
  });
  const byFirst = async (first: string) => db.user.findFirstOrThrow({ where: { firstName: first, status: "active" } });
  const tree: Record<string, string[]> = { Jahanavi: ["Himanshu", "Unnat", "Tripti"], Meenakshi: ["Ankit"] };
  for (const [csName, team] of Object.entries(tree)) {
    const cs = await byFirst(csName);
    await db.user.update({ where: { id: cs.id }, data: { groupId: group.id, reportsToId: ga.id } });
    for (const e of team) {
      const emp = await byFirst(e);
      await db.user.update({ where: { id: emp.id }, data: { groupId: group.id, reportsToId: cs.id } });
    }
  }
  console.log(`Studio A: group admin ga-demo, CS ${Object.keys(tree).join(" + ")}, ${Object.values(tree).flat().length} employees`);
}

main().finally(() => db.$disconnect());

import { fullName, requireUser } from "@/lib/auth";
import { clientContext, pieces, projectsFor } from "@/lib/client-views";
import { ProjectsView } from "@/components/client/views";

export const metadata = { title: "Projects" };

export default async function Projects() {
  const u = await requireUser(["client"]);
  const { brand } = await clientContext(u);
  const list = await pieces(u);
  const projs = await projectsFor(u, list);
  return <ProjectsView list={projs} pieces={list} projects={projs.map((p) => ({ id: p.id, name: p.name }))}
    since={brand.sinceYear ? `Since ${brand.sinceYear}` : "—"} me={{ name: fullName(u), phone: u.mobile ?? "" }} />;
}

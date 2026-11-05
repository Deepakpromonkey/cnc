import { requireUser } from "@/lib/auth";
import { noticesFor } from "@/lib/client-views";
import { NoticesView } from "@/components/client/views";

export const metadata = { title: "Notices" };

export default async function Notices() {
  await requireUser(["client"]);
  return <NoticesView list={await noticesFor()} />;
}

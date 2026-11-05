import { fullName, requireUser } from "@/lib/auth";
import { clientContext } from "@/lib/client-views";
import { fileUrl } from "@/lib/storage";
import { FREQUENCY_LABEL } from "@/lib/status";
import { ProfileView } from "@/components/client/views";

export const metadata = { title: "Your brand" };

export default async function Profile() {
  const u = await requireUser(["client"]);
  const { brand: b } = await clientContext(u);
  const logo = fileUrl(b.logoFileId, "320");
  return (
    <ProfileView
      me={{ name: fullName(u), email: u.email, phone: u.mobile ?? "", whatsapp: u.whatsappNo ?? b.whatsapp ?? "", instagram: b.instagram ?? "", website: b.website ?? "", logo }}
      brand={{
        name: b.name, company: b.companyName ?? b.name, since: b.sinceYear ? String(b.sinceYear) : "", officialEmail: b.officialEmail ?? "",
        address: b.address ?? "", city: b.city ?? "", state: b.state ?? "", pincode: b.pincode ?? "", gstin: b.gstin ?? "", linkedin: b.linkedin ?? "",
        scope: b.scope.map((s) => s.scope.name), engagement: [FREQUENCY_LABEL[b.frequency], b.paymentTerms].filter(Boolean).join(" · "), logo,
      }}
      csFirst={b.cs[0]?.user.firstName ?? "your CS"} prefs={(b.preferences ?? {}) as Record<string, boolean>} />
  );
}

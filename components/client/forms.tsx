"use client";
import { ActionForm, F, Sel, UploadMany, UploadOne, useUi } from "../kit";
import { raiseRequest } from "@/app/actions/ops";
import { changePassword } from "@/app/actions/common";
import { saveClientDetails } from "@/app/actions/client";

const em = (s: string) => <em style={{ color: "var(--brand-ink)" }}>{s}</em>;

function Actions({ primary }: { primary: string }) {
  const { close } = useUi();
  return <div className="actions"><button className="btn primary" type="submit">{primary}</button><button className="btn" type="button" onClick={close}>Cancel</button></div>;
}

export type Me = { name: string; email: string; phone: string; whatsapp: string; instagram: string; website: string; logo: string | null };

export function RequestForm({ projects, projectId, title, me }: { projects: { id: string; name: string }[]; projectId?: string; title?: string; me?: Pick<Me, "name" | "phone"> }) {
  return (
    <ActionForm action={raiseRequest} className="dform">
      <div className="eyebrow">New request</div>
      <h2>Ask for {em("anything.")}</h2>
      <div className="form">
        <F label="Project"><Sel name="projectId" options={[["__none", "New — not part of a project"], ...projects.map((p) => [p.id, p.name] as [string, string])]} value={projectId ?? "__none"} /></F>
        <F label="What do you need?"><input name="subject" defaultValue={title ?? ""} placeholder="e.g. Diwali post for all handles" required /></F>
        <F label="Details"><textarea name="description" placeholder="Sizes, copy, where it will run" /></F>
        <div className="two">
          <F label="Needed by"><input type="date" name="neededBy" /></F>
          <F label="Priority"><Sel name="priority" options={[["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"], ["low", "Low"]]} value="normal" /></F>
        </div>
        <div className="two">
          <F label="Contact person"><input name="pocName" defaultValue={me?.name} /></F>
          <F label="Contact number"><input name="pocContact" defaultValue={me?.phone} /></F>
        </div>
        <UploadMany name="files" label="Reference images" hint="Samples, screenshots, your old creatives" linkName="link" />
        <F label="Reference link"><input name="referenceLink" placeholder="Site / Instagram / Drive" /></F>
      </div>
      <Actions primary="Send request" />
    </ActionForm>
  );
}

export function DetailsForm({ me }: { me: Me }) {
  return (
    <ActionForm action={saveClientDetails} className="dform">
      <div className="eyebrow">Edit details</div>
      <h2>{me.name}</h2>
      <div className="form">
        <UploadOne name="logo" label="Brand logo" hint="Shows on your portal and invoices" round existing={me.logo} />
        <div className="two"><F label="Your name"><input name="name" defaultValue={me.name} required /></F><F label="Phone"><input name="phone" defaultValue={me.phone} /></F></div>
        <div className="two"><F label="WhatsApp for digests"><input name="whatsapp" defaultValue={me.whatsapp} /></F><F label="Login email"><input type="email" name="email" defaultValue={me.email} required /></F></div>
        <div className="two"><F label="Instagram"><input name="instagram" defaultValue={me.instagram} /></F><F label="Website"><input name="website" defaultValue={me.website} /></F></div>
        <p className="muted small" style={{ margin: 0 }}>Company, address and tax details are edited by your CS.</p>
      </div>
      <Actions primary="Save" />
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} className="dform">
      <div className="eyebrow">Change password</div>
      <h2>New {em("key.")}</h2>
      <div className="form">
        <F label="Current password"><input type="password" name="current" autoComplete="current-password" required /></F>
        <F label="New password"><input type="password" name="password" autoComplete="new-password" minLength={10} placeholder="At least 10 characters" required /></F>
        <F label="Repeat new password"><input type="password" name="repeat" autoComplete="new-password" minLength={10} required /></F>
      </div>
      <Actions primary="Change" />
    </ActionForm>
  );
}

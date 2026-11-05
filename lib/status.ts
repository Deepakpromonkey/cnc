import type { Tone } from "@prisma/client";

// Spec §6.2: names are admin-managed; behaviour hangs off the semantic flags only.
export type StatusDef = {
  id: string; name: string; tone: Tone; order: number;
  isStart: boolean; isDone: boolean; isClientGate: boolean; isReview: boolean; isRejected: boolean;
};

/** CSS class for the `.st` pill, from the mockup's tones. */
export const toneClass = (t: Tone) => ({ neutral: "", crimson: "brand", gold: "gold", muted: "dim" })[t];

/** Late = past deadline and not done / with client / in review (§6.3). */
export function isLateStatus(s: Pick<StatusDef, "isDone" | "isClientGate" | "isReview">) {
  return !s.isDone && !s.isClientGate && !s.isReview;
}

/** Client-language label (§6.2). */
export function clientLabel(s: Pick<StatusDef, "isStart" | "isDone" | "isClientGate" | "isReview">) {
  if (s.isStart) return "Queued";
  if (s.isReview) return "Internal review";
  if (s.isClientGate) return "Your approval";
  if (s.isDone) return "Done";
  return "In the works";
}

export const CLIENT_STEPS = ["Queued", "In the works", "Internal review", "Your approval", "Done"] as const;

export function clientStep(s: Pick<StatusDef, "isStart" | "isDone" | "isClientGate" | "isReview">) {
  return CLIENT_STEPS.indexOf(clientLabel(s)) + 1;
}

export function clientToneClass(label: string) {
  return label === "Your approval" ? "brand" : label === "Done" ? "gold" : label === "Queued" ? "dim" : "";
}

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const priorityLabel = (p: string) => p[0].toUpperCase() + p.slice(1);
export const priorityClass = (p: string) => (p === "urgent" ? "brand" : p === "high" ? "gold" : "dim");

export const FREQUENCY_LABEL: Record<string, string> = {
  monthly_retainer: "Monthly retainer", quarterly: "Quarterly", yearly: "Yearly", project_based: "Project-based",
};

export const REQUEST_LABEL: Record<string, string> = { new: "New", answered: "Answered", on_hold: "On hold", converted: "Converted" };
export const REQUEST_CLASS: Record<string, string> = { new: "brand", answered: "gold", on_hold: "dim", converted: "gold" };

export const INVOICE_LABEL: Record<string, string> = { draft: "Draft", sent: "Due", viewed: "Due", paid: "Paid", overdue: "Overdue", void: "Void" };
export const INVOICE_CLASS: Record<string, string> = { draft: "dim", sent: "dim", viewed: "dim", paid: "gold", overdue: "brand", void: "dim" };

export const CONCERN_LABEL: Record<string, string> = { open: "Open", in_discussion: "In discussion", resolved: "Resolved" };
export const CONCERN_CLASS: Record<string, string> = { open: "brand", in_discussion: "gold", resolved: "dim" };

export const CONCERN_CATEGORIES: Record<string, string> = {
  workload: "Workload", client_behaviour: "Client behaviour", process: "Process", team: "Team", leave: "Leave",
  equipment: "Equipment", workplace: "Workplace", pay: "Pay", other: "Other",
};

export const PROJECT_TYPES = ["Social media", "Campaign", "Packaging", "Print", "Launch", "Brand identity", "E-commerce", "Website", "Event", "Other"];

export const ROLE_LABEL: Record<string, string> = { admin: "Admin", group_admin: "Group admin", cs: "Client servicing", employee: "Employee", client: "Client" };
/** The mockup's avatar classes use "emp" for employees. */
export const roleClass = (r: string) => (r === "employee" ? "emp" : r === "group_admin" ? "admin" : r);

export const FLAG_CLASS: Record<string, string> = { gold: "gold", crimson: "red", cream: "cream", muted: "muted" };

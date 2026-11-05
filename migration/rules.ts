// Pure mapping helpers for the legacy → v2 migration (spec §12). No I/O here.

const ACRONYMS = new Set(["RPS", "TCS", "IMS", "LLP", "SEO", "HR", "CS", "J", "C", "M/S", "POSM", "SMP", "SMPS", "EDM", "EDMS", "RPD", "IP", "TC", "PDP", "QR", "NA", "LTD", "PVT"]);

/** "HIMALAYA OPTICALS" → "Himalaya Opticals"; leaves mixed-case input alone. */
export function smartCase(s: string | null | undefined, force = false) {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const shouty = t === t.toUpperCase() && /[A-Z]/.test(t);
  const quiet = t === t.toLowerCase() && /[a-z]/.test(t);
  if (!shouty && !(force && quiet)) return t;
  return t.split(" ").map((w) => {
    const bare = w.replace(/[(),.&]/g, "").toUpperCase();
    if (ACRONYMS.has(bare) && bare !== "LTD" && bare !== "PVT") return w.toUpperCase();
    if (/^\d/.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ")
    .replace(/\bLtd\b/g, "Ltd").replace(/\bPvt\b/g, "Pvt");
}

/** "7TH OF EVERY MONTH" → "7th of every month" */
export function sentence(s: string | null | undefined) {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (t !== t.toUpperCase()) return t;
  const l = t.toLowerCase();
  return /^\d/.test(l) ? l : l.charAt(0).toUpperCase() + l.slice(1);
}

export const blank = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t && !/^(na|n\/a|null|undefined|-)$/i.test(t) ? t : null;
};

export function stripHtml(s: string | null | undefined) {
  return (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim() || null;
}

export function priority(p: string | null | undefined): "low" | "normal" | "high" | "urgent" {
  const v = (p ?? "").toLowerCase();
  return v === "high" ? "high" : v === "low" ? "low" : v === "urgent" ? "urgent" : "normal";
}

/** Legacy status slug → v2 seed status name (§12.3). */
export function statusName(slug: string | null | undefined): { name: string; note: string | null } {
  const s = (slug ?? "").toLowerCase().replace(/_/g, "-");
  if (s === "new") return { name: "New", note: null };
  if (s === "in-review") return { name: "In review", note: null };
  if (s === "review-rejected") return { name: "Review rejected", note: null };
  if (s === "completed") return { name: "Completed", note: null };
  if (s === "progressing") return { name: "Progressing", note: null };
  if (["pause", "paused", "delay", "task-on-hold", "on-hold", "pending", "review-progressing", "progressing-from-review"].includes(s)) {
    return { name: "Progressing", note: `Legacy status: ${slug}` };
  }
  return { name: "Progressing", note: `Unmapped legacy status: ${slug || "(empty)"}` };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (k: string, n: number) => new Date(Date.parse(`${k}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type DeadlineResult = { date: string; time: string; how: "date+time" | "time" | "date" | "default"; fromText: boolean; note: string | null };

/**
 * Spec §12.4 deadline rule. `base` is the legacy deadline date (IST), else start date, else the
 * day it was raised. Free text like "need by 1:30", "11am - 1pm", "21st oct", "tomorrow by 3pm"
 * is read for a date and/or time; anything unreadable falls back to 18:00 IST.
 */
export function parseDeadline(base: string, raisedOn: string, textRaw: string | null | undefined, hadDate: boolean): DeadlineResult {
  const text = (textRaw ?? "").trim();
  if (!text) return { date: base, time: "18:00", how: hadDate ? "date" : "default", fromText: false, note: null };
  const low = text.toLowerCase();
  let date: string | null = null;

  let m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(low);
  if (m) date = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(low);
  if (!date && m) date = `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*/.exec(low);
  if (!date && m) date = `${raisedOn.slice(0, 4)}-${pad(MONTHS[m[2]])}-${pad(+m[1])}`;
  if (!date && /tomorrow/.test(low)) date = addDays(raisedOn, 1);
  if (!date && /today/.test(low)) date = raisedOn;

  // Times: take the last one mentioned (end of a range). "1;30" is a typo for 1:30.
  let time: string | null = null;
  const re = /(\d{1,2})(?:\s*[:;.]\s*(\d{2}))?\s*(am|pm)?/g;
  const cleaned = low.replace(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g, " ").replace(/\d{1,2}(st|nd|rd|th)\s+[a-z]+/g, " ");
  let last: RegExpExecArray | null = null;
  for (let x = re.exec(cleaned); x; x = re.exec(cleaned)) {
    const h = +x[1];
    if (h >= 1 && h <= 12 && (x[2] || x[3] || /\b(by|till|until|-|to)\s*$/.test(cleaned.slice(0, x.index)) || /need|by|done/.test(cleaned))) last = x;
  }
  if (last) {
    let h = +last[1];
    const min = last[2] ? +last[2] : 0;
    const ap = last[3] ?? (h <= 7 ? "pm" : h === 12 ? "pm" : "am"); // studio hours: 1–7 means afternoon
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (min < 60) time = `${pad(h)}:${pad(min)}`;
  }
  if (!time && /first half/.test(low)) time = "13:00";
  if (/^post\s/.test(low)) time = null; // "post 4 pm" = after 4, not a deadline

  return {
    date: date ?? base, time: time ?? "18:00", how: date && time ? "date+time" : time ? "time" : date ? "date" : "default",
    fromText: true, note: `Legacy deadline note: ${text}`,
  };
}

/** Concern category from free text (legacy had none). */
export function concernCategory(subject: string, details: string) {
  const t = `${subject} ${details}`.toLowerCase();
  if (/rude|attitude|behaviou?r|abusive|irritat|hyper|treatment|problem with|speak|environment|hate|undersr/.test(t)) return "team" as const;
  if (/brief|process|work isue|work issue/.test(t)) return "process" as const;
  if (/leave/.test(t)) return "leave" as const;
  if (/salary|pay/.test(t)) return "pay" as const;
  if (/workload|late night|too many/.test(t)) return "workload" as const;
  return "other" as const;
}

// All business rules and display run in Asia/Kolkata (spec §6.1). India has no DST,
// so IST is a fixed +05:30 offset; we never rely on the server's own timezone.

const OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A Date whose UTC getters read as IST wall-clock. Internal use only. */
function shift(d: Date) {
  return new Date(d.getTime() + OFFSET_MS);
}

export function istParts(d: Date) {
  const s = shift(d);
  return {
    y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate(),
    h: s.getUTCHours(), min: s.getUTCMinutes(), dow: s.getUTCDay(),
  };
}

/** "2026-10-23" for the IST calendar day of an instant. */
export function istDateKey(d: Date = new Date()) {
  const p = istParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** UTC instant of IST midnight that starts the day containing d. */
export function istStartOfDay(d: Date = new Date()) {
  const s = shift(d);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - OFFSET_MS);
}

export function istStartOfMonth(d: Date = new Date()) {
  const s = shift(d);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) - OFFSET_MS);
}

/** First-of-month as a DATE value (UTC midnight), for `month` columns. */
export function istMonthDate(d: Date = new Date()) {
  const p = istParts(d);
  return new Date(Date.UTC(p.y, p.m, 1));
}

/** DATE column value (UTC midnight) for the IST day of d. */
export function istDateOnly(d: Date = new Date()) {
  const p = istParts(d);
  return new Date(Date.UTC(p.y, p.m, p.d));
}

/** Parse an IST date ("2026-10-24") + time ("18:00") into a UTC instant. */
export function fromIst(date: string, time = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h || 0, min || 0) - OFFSET_MS);
}

/** DATE column value from "2026-10-24". */
export function dateOnly(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-10-24" from a DATE column value (UTC midnight = 05:30 IST, so IST gives the same day). */
export function dateKey(d: Date | null | undefined) {
  if (!d) return "";
  return istDateKey(d);
}

/** "18:00" IST for an instant. */
export function istTimeKey(d: Date) {
  const p = istParts(d);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}

export function fmtTime(d: Date) {
  const p = istParts(d);
  return `${p.h % 12 || 12}:${String(p.min).padStart(2, "0")} ${p.h < 12 ? "am" : "pm"}`;
}

export function fmtDay(d: Date) {
  const p = istParts(d);
  return `${p.d} ${MONTHS[p.m]}`;
}

export function fmtDayYear(d: Date) {
  const p = istParts(d);
  return `${p.d} ${MONTHS[p.m]} ${p.y}`;
}

/** "24 Oct" in IST. Safe for DATE columns too: their UTC-midnight value is 05:30 IST the same day. */
export function fmtDate(d: Date | null | undefined, withYear = false) {
  if (!d) return "—";
  const p = istParts(d);
  const s = `${p.d} ${MONTHS[p.m]}`;
  return withYear ? `${s} ${p.y}` : s;
}

export function fmtLongDay(d: Date = new Date()) {
  const p = istParts(d);
  return `${WEEKDAYS_LONG[p.dow]}, ${p.d} ${MONTHS_LONG[p.m]} ${p.y}`;
}

export function monthName(d: Date = new Date(), long = false) {
  const p = istParts(d);
  return long ? MONTHS_LONG[p.m] : MONTHS[p.m];
}

export function isIstToday(d: Date, now = new Date()) {
  return istDateKey(d) === istDateKey(now);
}

/** "Today, 6:00 pm" or "Tue 21 Oct, 6:00 pm" — matches the mockup's dueFmt. */
export function fmtDue(d: Date, now = new Date()) {
  const p = istParts(d);
  const day = isIstToday(d, now) ? "Today" : `${WEEKDAYS[p.dow]} ${p.d} ${MONTHS[p.m]}`;
  return `${day}, ${fmtTime(d)}`;
}

/** "9:40 am" today, "Yesterday 6:48 pm", "22 Oct 11:20 am". */
export function fmtWhen(d: Date, now = new Date()) {
  const today = istDateKey(now);
  const key = istDateKey(d);
  if (key === today) return `Today ${fmtTime(d)}`;
  if (key === istDateKey(new Date(now.getTime() - DAY_MS))) return `Yesterday ${fmtTime(d)}`;
  return `${fmtDay(d)} ${fmtTime(d)}`;
}

/** "2 h ago", "3 days ago" — relative, for last-activity columns. */
export function fmtAgo(d: Date | null | undefined, now = new Date()) {
  if (!d) return "—";
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (isIstToday(d, now)) return `${Math.floor(ms / 3_600_000)} h ago`;
  if (istDateKey(d) === istDateKey(new Date(now.getTime() - DAY_MS))) return "yesterday";
  return `${Math.max(2, Math.round(ms / DAY_MS))} days ago`;
}

/** Spec §6.1 lateness label; "" when not late. */
export function lateness(deadline: Date, now = new Date()) {
  const ms = now.getTime() - deadline.getTime();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.floor(ms / 60_000)} min late`;
  if (h < 12) return `${h} h late`;
  return `${Math.max(1, Math.round(h / 24))} d late`;
}

/** The big number + unit used in the "Running late" list. */
export function latenessParts(deadline: Date, now = new Date()): [number, string] {
  const ms = now.getTime() - deadline.getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return [Math.max(1, Math.floor(ms / 60_000)), "min"];
  if (h < 12) return [h, "h"];
  const d = Math.max(1, Math.round(h / 24));
  return [d, d === 1 ? "day" : "days"];
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function greeting(now = new Date()) {
  const h = istParts(now).h;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export { DAY_MS, MONTHS, WEEKDAYS };

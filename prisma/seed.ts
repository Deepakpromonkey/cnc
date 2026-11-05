/* Demo seed: the sample CNC data from /design/*.html, shifted so the mockup's "today"
 * (Fri 23 Oct 2026) lands on the real current IST day. Real data arrives via /migration (§12). */
import { PrismaClient, type Priority, type Frequency, type Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { closeDay, materialiseDay } from "../lib/attendance";
import { computeScores } from "../lib/scoring";
import { DAY_MS, istDateKey, istMonthDate, istParts } from "../lib/time";

const db = new PrismaClient();
const MOCK_TODAY = "2026-10-23";
const NOW = new Date();
const TODAY = istDateKey(NOW);
const SHIFT = Math.round((Date.parse(TODAY) - Date.parse(MOCK_TODAY)) / DAY_MS);

const MON: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const pad = (n: number) => String(n).padStart(2, "0");
const shiftKey = (k: string, extra = 0) => new Date(Date.parse(k) + (SHIFT + extra) * DAY_MS).toISOString().slice(0, 10);
const at = (k: string, t = "10:00") => new Date(`${shiftKey(k)}T${t}:00+05:30`);
const dOnly = (k: string) => new Date(`${shiftKey(k)}T00:00:00Z`);
/**
 * Past events (history, comments, requests…) must never land in the future when seeding early
 * in the day: squeeze any later-today time into the part of today that has already happened,
 * keeping their order.
 */
function past(d: Date) {
  if (d <= NOW) return d;
  const start = new Date(`${TODAY}T00:00:00+05:30`).getTime();
  const end = start + DAY_MS;
  return new Date(start + ((Math.min(d.getTime(), end - 1) - start) / DAY_MS) * (NOW.getTime() - start - 60_000));
}
/** "19 Oct 10:10" | "16 Oct" | "Today 7:48 am" | "Yesterday 4:10 pm" | "20 Oct 11:30 am" → instant */
function mockWhen(s: string, defTime = "10:00") {
  return past(mockWhenRaw(s, defTime));
}
function mockWhenRaw(s: string, defTime = "10:00") {
  let m = /^(Today|Yesterday)\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(s);
  if (m) {
    const k = m[1].toLowerCase() === "today" ? MOCK_TODAY : "2026-10-22";
    let h = +m[2]; if (m[4]?.toLowerCase() === "pm" && h < 12) h += 12; if (m[4]?.toLowerCase() === "am" && h === 12) h = 0;
    return at(k, `${pad(h)}:${m[3]}`);
  }
  m = /^(\d{1,2}) (\w{3})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/.exec(s);
  if (m) {
    let h = m[3] ? +m[3] : +defTime.slice(0, 2); const min = m[4] ?? defTime.slice(3);
    if (m[5] === "pm" && h < 12) h += 12; if (m[5] === "am" && h === 12) h = 0;
    return at(`2026-${pad(MON[m[2]] + 1)}-${pad(+m[1])}`, `${pad(h)}:${min}`);
  }
  if (/^today$/i.test(s)) return at(MOCK_TODAY);
  return at(MOCK_TODAY);
}
const mockDate = (s: string) => { const d = mockWhen(s); return new Date(`${istDateKey(d)}T00:00:00Z`); };

// Deterministic RNG so reseeding gives the same month.
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

// ---------------- sample data (from cnc-admin.html) ----------------
const PEOPLE = [
  { n: "Vipin Chauhan", role: "admin", dept: "Management", desig: "Founder & Creative Head", in: "9:02", gender: "male", login: "vipin", li: "vipinchauhan", addr: "Sector 50", pin: "201301" },
  { n: "Nitin Chauhan", role: "admin", dept: "HR", desig: "Director · Operations & HR", in: "9:40", login: "nitin" },
  { n: "Jahanavi Khullar", role: "cs", dept: "Client servicing", desig: "Head · Client Servicing", in: "9:12", email: "jahanavi@coffeeandcreative.in" },
  { n: "Meenakshi Baliyan", role: "cs", dept: "Client servicing", in: "9:21" },
  { n: "Muskan Tanwar", role: "cs", dept: "Client servicing", in: "9:04" },
  { n: "Bhoomika Jain", role: "cs", dept: "Client servicing", in: "9:45" },
  { n: "Ridhima Gupta", role: "cs", dept: "Client servicing", in: "9:31" },
  { n: "Pranjal Arya", role: "cs", dept: "Client servicing", in: "10:02" },
  { n: "Gauri Sawhney", role: "cs", dept: "Client servicing", in: "9:50" },
  { n: "Tanisha Kumar", role: "cs", dept: "Client servicing", in: "", leave: true },
  { n: "Khushi Rattan Paul", role: "cs", dept: "Client servicing", in: "9:27" },
  { n: "Himanshu Dhondiyal", role: "employee", dept: "Graphic design", desig: "Design Lead", in: "9:58", li: "himanshu-dhondiyal", stats: { tasks: 18, ontime: 100, pass: 94, cs: 4.9, eod: 100, att: 98 } },
  { n: "Unnat Dixit", role: "employee", dept: "Graphic design", in: "10:05", stats: { tasks: 21, ontime: 90, pass: 86, cs: 4.6, eod: 96, att: 100 } },
  { n: "Tripti Panchal", role: "employee", dept: "Packaging design", in: "9:49", stats: { tasks: 11, ontime: 91, pass: 82, cs: 4.8, eod: 100, att: 95 } },
  { n: "Ankit Koli", role: "employee", dept: "Copywriting", in: "9:33", stats: { tasks: 14, ontime: 86, pass: 88, cs: 4.4, eod: 100, att: 92 } },
  { n: "Mehul Goswami", role: "employee", dept: "Video editing", in: "10:18", stats: { tasks: 7, ontime: 71, pass: 90, cs: 4.2, eod: 86, att: 90 } },
  { n: "Prince Sharma", role: "employee", dept: "Copywriting", in: "10:11", stats: { tasks: 9, ontime: 67, pass: 85, cs: 4.0, eod: 90, att: 94 } },
  { n: "Sahil Ali", role: "employee", dept: "Motion design", in: "10:36", stats: { tasks: 8, ontime: 63, pass: 80, cs: 3.9, eod: 75, att: 88 } },
  { n: "Kasim Saifi", role: "employee", dept: "Graphic design", in: "", absent: true, stats: { tasks: 6, ontime: 50, pass: 78, cs: 3.6, eod: 67, att: 81 } },
] as const;

const DEPTS = ["Management", "Client servicing", "Graphic design", "Packaging design", "Motion design", "Video editing", "Copywriting", "Creative direction", "Social media", "Web", "Accounts", "HR"];
const SCOPE = ["Social media management", "Social media", "Creative design", "Copywriting", "Reels & short video", "Reels", "Campaign films", "Packaging", "Print", "Point of sale", "Brand identity", "Brochure & print", "Brochure", "Hoardings & OOH", "Hoardings", "Launch film", "Site branding", "Catalogue", "Website", "Product shoot", "E-commerce creatives", "Influencer marketing", "Influencer", "Event branding", "Amazon listings", "Menu design", "Logo lockup", "Product videos", "Festive creatives"];
const TITLES = ["Static post", "Carousel", "Reel", "Story set", "Campaign film", "Packaging dieline", "Brochure", "Hoarding", "Copy", "Catalogue", "Retouching", "Logo lockup", "Menu", "Report deck", "A+ content", "Other"];
const SERVICING = ["Design", "Copy", "Video", "Motion", "Packaging", "Print production", "Social media", "Web"];

type B = { n: string; cs: string[]; type: Frequency; scope: string[]; gst?: string; terms: string; since: number; fee: string; company?: string; address?: string; city?: string; state?: string; pincode?: string; officialEmail?: string; loginEmail?: string; whatsapp?: string; website?: string; instagram?: string; linkedin?: string; poc?: string; pocPhone?: string; division?: string; additional?: string };
const BRANDS: B[] = [
  { n: "Himalaya Opticals", cs: ["Jahanavi Khullar", "Ridhima Gupta"], type: "monthly_retainer", scope: ["Social media", "Creative design", "Copywriting", "Reels"], gst: "07AABCH2210K1Z5", terms: "7th of every month", since: 2019, fee: "₹1,85,000 / month", company: "Himalaya Vision Crafters Private Limited", address: "B-12, Sector 2", city: "Noida", state: "Uttar Pradesh", pincode: "201301", officialEmail: "neharika@himalayaopticals.in", loginEmail: "neharika@himalayaopticals.in", whatsapp: "98100 11223", website: "himalayaopticals.in", instagram: "@himalayaopticals", poc: "Neharika Binani", pocPhone: "98100 11223", division: "Retail", additional: "Festive calendar shared every quarter. Prefers WhatsApp approvals." },
  { n: "Thermocool", cs: ["Meenakshi Baliyan"], type: "project_based", scope: ["Campaign films", "Social media"], gst: "06AACCT7781M1ZQ", terms: "50% advance, 50% on delivery", since: 2022, fee: "₹2,40,000 · Diwali campaign", company: "Thermocool Home Appliances Pvt. Ltd.", address: "Plot 44, Phase II", city: "Gurugram", state: "Haryana", pincode: "122016", officialEmail: "marketing@thermocool.in", whatsapp: "98111 44556", website: "thermocool.in", poc: "Sunil Mehra", pocPhone: "98111 44556", division: "Consumer durables" },
  { n: "Kisan", cs: ["Bhoomika Jain"], type: "monthly_retainer", scope: ["Packaging", "Print", "Point of sale"], gst: "09AADCK4412P1Z2", terms: "7th of every month", since: 2020, fee: "₹96,000 / month", company: "Kisan Agro Foods", address: "Industrial Area, Sahibabad", city: "Ghaziabad", state: "Uttar Pradesh", pincode: "201005", officialEmail: "anil@kisanfoods.in", whatsapp: "99100 77889", poc: "Anil Agarwal", pocPhone: "99100 77889", division: "FMCG" },
  { n: "Trend Laminates", cs: ["Muskan Tanwar"], type: "yearly", scope: ["Catalogue", "Brand identity", "Website"], gst: "07AAFCT9901R1ZK", terms: "Quarterly in advance", since: 2018, fee: "₹14,00,000 / year", company: "Trend Laminates Pvt. Ltd.", city: "Delhi", pincode: "110020", officialEmail: "vikram@trendlaminates.com", website: "trendlaminates.com", poc: "Vikram Jain", pocPhone: "98100 99001", division: "Building materials" },
  { n: "Pinklam", cs: ["Pranjal Arya"], type: "monthly_retainer", scope: ["Social media", "Influencer", "Reels"], gst: "06AAECP3320L1Z8", terms: "7th of every month", since: 2023, fee: "₹1,20,000 / month", poc: "Neha Kapoor" },
  { n: "RPS Group", cs: ["Ridhima Gupta"], type: "project_based", scope: ["Brochure", "Hoardings", "Launch film", "Site branding"], gst: "06AABCR5566Q1ZN", terms: "30 days", since: 2021, fee: "₹3,10,000 · Tower C launch", company: "RPS Infrastructure Ltd.", address: "Tower A, Sector 88", city: "Faridabad", state: "Haryana", pincode: "121002", officialEmail: "sameer@rpsgroup.in", whatsapp: "98180 22334", website: "rpsgroup.in", linkedin: "rps-group", poc: "Sameer Rana", pocPhone: "98180 22334", division: "Real estate", additional: "Three live sites. Hoarding vendor sizes on Drive." },
  { n: "Ledvance", cs: ["Gauri Sawhney"], type: "monthly_retainer", scope: ["Social media", "Creative design"], gst: "07AADCL0098H1ZV", terms: "7th of every month", since: 2022, fee: "₹1,50,000 / month", poc: "Priya Nair" },
  { n: "Digitek", cs: ["Tanisha Kumar"], type: "project_based", scope: ["Product shoot", "E-commerce creatives"], gst: "07AAACD3344F1ZB", terms: "50% advance", since: 2024, fee: "₹1,10,000", company: "IMS Mercantiles Limited", city: "Delhi", officialEmail: "lakshita@digitek.in", poc: "Lakshita Surana" },
  { n: "Adventure Tales", cs: ["Khushi Rattan Paul"], type: "monthly_retainer", scope: ["Social media", "Copywriting"], terms: "7th of every month", since: 2023, fee: "₹60,000 / month", poc: "Aman Chawla" },
  { n: "Marc", cs: ["Gauri Sawhney"], type: "project_based", scope: ["Packaging", "Logo lockup"], terms: "50% advance", since: 2025, fee: "₹75,000", poc: "Marc team" },
  { n: "Aravali One", cs: ["Ridhima Gupta"], type: "project_based", scope: ["Brochure", "Hoardings"], terms: "30 days", since: 2024, fee: "₹1,40,000" },
  { n: "Marlin", cs: ["Meenakshi Baliyan"], type: "monthly_retainer", scope: ["Social media"], terms: "7th of every month", since: 2022, fee: "₹55,000 / month" },
  { n: "Summercool", cs: ["Pranjal Arya"], type: "project_based", scope: ["Product videos"], terms: "Advance", since: 2025, fee: "Quote pending", company: "Summercool Home Appliances Ltd", city: "Delhi", officialEmail: "ashutosh@summercool.in", poc: "Ashutosh Gupta" },
  { n: "Longway", cs: ["Muskan Tanwar"], type: "monthly_retainer", scope: ["Social media", "Reels"], terms: "7th of every month", since: 2023, fee: "₹70,000 / month", company: "Onetail Brands Technologies Limited", city: "Delhi", officialEmail: "jitender@longway.in", poc: "Jitender" },
  { n: "Sarvagun Ayurveda", cs: ["Bhoomika Jain"], type: "monthly_retainer", scope: ["Packaging", "Social media", "Amazon listings"], terms: "7th of every month", since: 2024, fee: "₹85,000 / month", company: "Authenticert Assurance Private Limited", city: "Delhi", officialEmail: "siddharth@sarvagun.in", poc: "Siddharth Saxena", division: "Ayurveda" },
  { n: "Friday Night Cars", cs: ["Tanisha Kumar"], type: "project_based", scope: ["Event branding", "Reels"], terms: "Advance", since: 2025, fee: "₹45,000", company: "Acceleron Motors Cars Private Limited", city: "Gurugram", officialEmail: "avikal@fridaynightcars.in", poc: "Avikal Johri" },
  { n: "Jee Bhar Ke", cs: ["Khushi Rattan Paul"], type: "monthly_retainer", scope: ["Social media", "Menu design"], terms: "7th of every month", since: 2024, fee: "₹40,000 / month", company: "Divine Dishes Private Limited", city: "Delhi", officialEmail: "rajni@jeebharke.in", poc: "Rajni Rathore", division: "F&B" },
  { n: "Avani", cs: ["Jahanavi Khullar"], type: "monthly_retainer", scope: ["Social media", "Festive creatives"], terms: "7th of every month", since: 2023, fee: "₹65,000 / month", company: "Mrida Future Realty LLP", city: "Gurugram", state: "Haryana", officialEmail: "minakshi@avaniinfratech.com", poc: "Minakshi Bisht", pocPhone: "98100 33445", division: "Real estate" },
  { n: "Rasa Group", cs: ["Meenakshi Baliyan"], type: "project_based", scope: ["Brand identity"], terms: "50% advance", since: 2025, fee: "₹2,00,000", company: "Rasa Aaraaysa Group", city: "Delhi", officialEmail: "disha@rasagroup.in", poc: "Disha Sharma" },
];

type P = { b: string; n: string; poc?: string; pocPhone?: string; type: string; sub: string; desc: string; scope: string[]; start: string; deadline: string; refs: string[]; terms: string; pri: Priority; st: string; comments?: [string, string, string][] };
const PROJECTS: P[] = [
  { b: "Himalaya Opticals", n: "Social media · Oct", poc: "Neharika Binani", pocPhone: "98100 11223", type: "Social media", sub: "Monthly calendar", desc: "October content calendar across Instagram, Facebook and LinkedIn. 12 statics, 4 reels, 8 stories.", scope: ["Social media", "Reels", "Copywriting"], start: "2026-10-01", deadline: "2026-10-31", refs: ["drive.google.com/drive/himalaya-oct-brief", "himalayaopticals.in/new-arrivals"], terms: "Monthly retainer", pri: "normal", st: "Progressing", comments: [["Jahanavi Khullar", "14 Oct", "Client wants more frame close-ups this month, fewer lifestyle shots."]] },
  { b: "Himalaya Opticals", n: "Social media · Sep", poc: "Neharika Binani", pocPhone: "98100 11223", type: "Social media", sub: "Monthly calendar", desc: "September calendar.", scope: ["Social media"], start: "2026-09-01", deadline: "2026-09-30", refs: [], terms: "Monthly retainer", pri: "normal", st: "Completed" },
  { b: "Thermocool", n: "Diwali 2026 campaign", poc: "Sunil Mehra", pocPhone: "98111 44556", type: "Campaign", sub: "Festive film", desc: "30 s hero film + 3 cutdowns + 6 statics for Diwali. Dealer version with end-slate variants.", scope: ["Campaign films", "Social media"], start: "2026-10-05", deadline: "2026-10-28", refs: ["drive.google.com/drive/thermocool-script", "youtube.com/watch?v=last-year-film"], terms: "50% advance, 50% on delivery", pri: "high", st: "Progressing", comments: [["Meenakshi Baliyan", "21 Oct", "Client flagged the cut length on v1. Consolidated note sent to Mehul."], ["Mehul Goswami", "22 Oct", "v2 exported, uploading tonight."]] },
  { b: "Kisan", n: "Ghee range refresh", poc: "Anil Agarwal", pocPhone: "99100 77889", type: "Packaging", sub: "Range redesign", desc: "New packaging for 200 ml, 500 ml, 1 L and 5 L ghee. Dielines from the vendor on Drive.", scope: ["Packaging", "Print"], start: "2026-10-10", deadline: "2026-11-05", refs: ["drive.google.com/drive/kisan-dielines"], terms: "Monthly retainer", pri: "high", st: "Progressing" },
  { b: "RPS Group", n: "Tower C launch", poc: "Sameer Rana", pocPhone: "98180 22334", type: "Launch", sub: "Real estate launch", desc: "Brochure, 6 hoardings, site branding and a launch film for Tower C, Sector 88.", scope: ["Brochure", "Hoardings", "Launch film", "Site branding"], start: "2026-10-01", deadline: "2026-11-15", refs: ["drive.google.com/drive/rps-sizes", "rpsgroup.in/tower-c"], terms: "30 days", pri: "urgent", st: "Progressing", comments: [["Ridhima Gupta", "22 Oct", "Vendor confirmed hoarding sizes. Sharing with Himanshu."]] },
  { b: "Trend Laminates", n: "Catalogue 2027", poc: "Vikram Jain", pocPhone: "98100 99001", type: "Print", sub: "Catalogue", desc: "180-page product catalogue, 3 cover options first.", scope: ["Catalogue"], start: "2026-10-20", deadline: "2026-12-20", refs: [], terms: "Quarterly in advance", pri: "normal", st: "New" },
  { b: "Pinklam", n: "Social media · Oct", poc: "Neha Kapoor", type: "Social media", sub: "Monthly calendar", desc: "October calendar + product launch teaser.", scope: ["Social media", "Reels"], start: "2026-10-01", deadline: "2026-10-31", refs: [], terms: "Monthly retainer", pri: "normal", st: "Progressing" },
  { b: "Sarvagun Ayurveda", n: "Amazon listings", poc: "Siddharth Saxena", type: "E-commerce", sub: "A+ content", desc: "A+ content for 4 SKUs.", scope: ["Amazon listings"], start: "2026-10-15", deadline: "2026-10-30", refs: [], terms: "Monthly retainer", pri: "normal", st: "Awaiting client" },
  { b: "Rasa Group", n: "Identity", poc: "Disha Sharma", type: "Brand identity", sub: "Logo + system", desc: "Logo, palette, type and stationery for the group.", scope: ["Brand identity"], start: "2026-10-01", deadline: "2026-11-30", refs: [], terms: "50% advance", pri: "normal", st: "Awaiting client" },
  { b: "Digitek", n: "E-commerce Q4", poc: "Lakshita Surana", type: "E-commerce", sub: "Product shoot", desc: "Shoot + retouch 40 SKUs for marketplace listings.", scope: ["Product shoot", "E-commerce creatives"], start: "2026-10-18", deadline: "2026-11-02", refs: [], terms: "50% advance", pri: "normal", st: "Progressing" },
];

type T = { id: string; t: string; b: string; p: string; a: string; cs: string; st: string; due: string; link: string; hist: [string, string, string][]; eod: string[]; title?: string; serv?: string; pri?: Priority; start?: string; desc?: string; by?: string; assignees?: string[]; attach?: [string, string][]; comments?: [string, string, string][]; rating?: { stars: number; review: string; on: string } };
const TASKS: T[] = [
  { id: "T-1188", t: "Diwali campaign reel · v2", b: "Thermocool", p: "Diwali 2026 campaign", a: "Mehul Goswami", cs: "Meenakshi Baliyan", st: "Progressing", due: "2026-10-21T18:00", link: "drive.google.com/drive/thermocool-reel-v2", hist: [["19 Oct 10:10", "New", "Meenakshi"], ["19 Oct 11:02", "Progressing", "Mehul"], ["20 Oct 19:30", "In review", "Mehul"], ["21 Oct 09:15", "Review rejected · cut is 8 s too long, logo sting missing", "Meenakshi"], ["21 Oct 09:40", "Progressing", "Mehul"]], eod: ["21 Oct · Re-cut to 28 s, waiting on logo sting from Sahil", "22 Oct · Sting added, colour pass done, exporting"], title: "Reel", serv: "Video", pri: "high", start: "19 Oct", desc: "Re-cut hero film to 30 s with the new logo sting at the end. Dealer end-slate as a separate export.", assignees: ["Mehul Goswami", "Sahil Ali"], attach: [["drive.google.com/drive/thermocool-reel-v2", "Reel v2 export"], ["drive.google.com/drive/thermocool-script", "Script"]], comments: [["Meenakshi Baliyan", "21 Oct 9:15 am", "Client: cut is 8 s too long, logo sting missing. One note, nothing else."], ["Mehul Goswami", "21 Oct 9:40 am", "On it. Sting from Sahil by tonight."]] },
  { id: "T-1192", t: "October social calendar · 12 creatives", b: "Himalaya Opticals", p: "Social media · Oct", a: "Unnat Dixit", cs: "Jahanavi Khullar", st: "In review", due: "2026-10-22T11:00", link: "drive.google.com/drive/himalaya-oct", hist: [["14 Oct 10:00", "New", "Jahanavi"], ["14 Oct 10:30", "Progressing", "Unnat"], ["23 Oct 08:30", "In review", "Unnat"]], eod: ["22 Oct · 12/12 done, 2 need copy tweak from Ankit"], title: "Static post", serv: "Design", start: "14 Oct", desc: "12 statics for October, copy from Ankit. Frame close-ups, fewer lifestyle shots.", assignees: ["Unnat Dixit", "Ankit Koli"], attach: [["drive.google.com/drive/himalaya-oct", "October creatives"]] },
  { id: "T-1195", t: "Packaging dieline · 5 L jar", b: "Kisan", p: "Ghee range refresh", a: "Tripti Panchal", cs: "Bhoomika Jain", st: "Review rejected", due: "2026-10-22T17:00", link: "drive.google.com/drive/kisan-5l-v3", hist: [["16 Oct", "New", "Bhoomika"], ["17 Oct", "Progressing", "Tripti"], ["22 Oct 16:40", "In review", "Tripti"], ["22 Oct 18:12", "Review rejected · logo too close to seal", "Bhoomika"]], eod: ["22 Oct · v3 sent. Will move logo 4 mm down in v4 tomorrow"], title: "Packaging dieline", serv: "Packaging", pri: "high", start: "17 Oct", desc: "5 L jar label on vendor dieline. Keep 6 mm from the seal.", attach: [["drive.google.com/drive/kisan-5l-v3", "v3 (rejected)"], ["drive.google.com/drive/kisan-dielines", "Vendor dieline"]], comments: [["Bhoomika Jain", "22 Oct 6:12 pm", "Logo too close to seal, rest is lovely."]] },
  { id: "T-1201", t: "Brochure copy · Tower C", b: "RPS Group", p: "Tower C launch", a: "Prince Sharma", cs: "Ridhima Gupta", st: "Progressing", due: "2026-10-23T10:00", link: "", hist: [["20 Oct", "New", "Ridhima"], ["20 Oct 11:00", "Progressing", "Prince"]], eod: ["22 Oct · 6 of 9 pages drafted"] },
  { id: "T-1203", t: "Navratri thank-you post", b: "Avani", p: "Festive 2026", a: "Unnat Dixit", cs: "Jahanavi Khullar", st: "New", due: "2026-10-23T16:00", link: "drive.google.com/drive/avani-brief", hist: [["23 Oct 09:20", "New · from client request", "Jahanavi"]], eod: [] },
  { id: "T-1204", t: "Reel · product launch teaser", b: "Pinklam", p: "Social media · Oct", a: "Sahil Ali", cs: "Pranjal Arya", st: "Progressing", due: "2026-10-23T14:00", link: "", hist: [["21 Oct", "New", "Pranjal"], ["21 Oct 11:00", "Progressing", "Sahil"]], eod: ["22 Oct · storyboard locked, animating"] },
  { id: "T-1205", t: "Hoarding adaptations × 6", b: "RPS Group", p: "Tower C launch", a: "Himanshu Dhondiyal", cs: "Ridhima Gupta", st: "In review", due: "2026-10-23T13:00", link: "drive.google.com/drive/rps-hoardings", hist: [["21 Oct", "New", "Ridhima"], ["21 Oct 11:00", "Progressing", "Himanshu"], ["23 Oct 09:05", "In review", "Himanshu"]], eod: ["22 Oct · all 6 sizes done, checking bleed"] },
  { id: "T-1206", t: "Amazon A+ content · 4 SKUs", b: "Sarvagun Ayurveda", p: "Amazon listings", a: "Tripti Panchal", cs: "Bhoomika Jain", st: "Awaiting client", due: "2026-10-24T18:00", link: "drive.google.com/drive/sarvagun-aplus", hist: [["18 Oct", "New", "Bhoomika"], ["19 Oct", "Progressing", "Tripti"], ["22 Oct", "In review", "Tripti"], ["22 Oct 15:00", "Awaiting client", "Bhoomika"]], eod: [] },
  { id: "T-1207", t: "Frame inspiration carousel", b: "Himalaya Opticals", p: "Social media · Oct", a: "Unnat Dixit", cs: "Jahanavi Khullar", st: "Awaiting client", due: "2026-10-23T18:00", link: "drive.google.com/drive/himalaya-carousel", hist: [["20 Oct", "New", "Jahanavi"], ["21 Oct", "Progressing", "Unnat"], ["22 Oct 12:00", "In review", "Unnat"], ["22 Oct 18:40", "Awaiting client", "Jahanavi"]], eod: [], title: "Carousel", desc: "8-slide carousel of new frames, warm tones, product close-ups." },
  { id: "T-1208", t: "Catalogue 2027 · cover options", b: "Trend Laminates", p: "Catalogue 2027", a: "Himanshu Dhondiyal", cs: "Muskan Tanwar", st: "Progressing", due: "2026-10-27T18:00", link: "", hist: [["22 Oct", "New", "Muskan"], ["22 Oct 12:00", "Progressing", "Himanshu"]], eod: [], title: "Catalogue" },
  { id: "T-1209", t: "Copy · festive offer posts × 4", b: "Ledvance", p: "Social media · Oct", a: "Ankit Koli", cs: "Gauri Sawhney", st: "Awaiting client", due: "2026-10-23T12:00", link: "docs.google.com/document/ledvance-copy", hist: [["21 Oct", "New", "Gauri"], ["21 Oct 12:00", "Progressing", "Ankit"], ["22 Oct 10:00", "In review", "Ankit"], ["22 Oct 13:00", "Awaiting client", "Gauri"]], eod: [] },
  { id: "T-1210", t: "Product shoot retouching · 40 images", b: "Digitek", p: "E-commerce Q4", a: "Kasim Saifi", cs: "Tanisha Kumar", st: "Progressing", due: "2026-10-24T18:00", link: "", hist: [["20 Oct", "New", "Tanisha"], ["21 Oct", "Progressing", "Kasim"]], eod: ["21 Oct · 14 done"], title: "Retouching" },
  { id: "T-1211", t: "Logo lockup · packaging revision", b: "Marc", p: "Packaging", a: "Himanshu Dhondiyal", cs: "Gauri Sawhney", st: "New", due: "2026-10-25T18:00", link: "", hist: [["22 Oct", "New · from client request", "Gauri"]], eod: [], title: "Logo lockup" },
  { id: "T-1212", t: "Menu redesign · winter", b: "Jee Bhar Ke", p: "Menu 2026", a: "Tripti Panchal", cs: "Khushi Rattan Paul", st: "Progressing", due: "2026-10-28T18:00", link: "", hist: [["21 Oct", "New", "Khushi"], ["22 Oct", "Progressing", "Tripti"]], eod: [], title: "Menu" },
  { id: "T-1213", t: "Reel · behind the scenes", b: "Longway", p: "Social media · Oct", a: "Mehul Goswami", cs: "Muskan Tanwar", st: "New", due: "2026-10-24T15:00", link: "", hist: [["23 Oct", "New", "Muskan"]], eod: [] },
  { id: "T-1214", t: "Story set · weekend sale", b: "Pinklam", p: "Social media · Oct", a: "Kasim Saifi", cs: "Pranjal Arya", st: "New", due: "2026-10-24T11:00", link: "", hist: [["23 Oct", "New", "Pranjal"]], eod: [], title: "Story set" },
  { id: "T-1215", t: "Copy · hoarding headlines", b: "RPS Group", p: "Tower C launch", a: "Ankit Koli", cs: "Ridhima Gupta", st: "In review", due: "2026-10-23T15:00", link: "docs.google.com/document/rps-headlines", hist: [["22 Oct", "New", "Ridhima"], ["22 Oct 11:00", "Progressing", "Ankit"], ["23 Oct 09:00", "In review", "Ankit"]], eod: [] },
  { id: "T-1216", t: "Site branding · hoarding mockups", b: "RPS Group", p: "Tower C launch", a: "Sahil Ali", cs: "Ridhima Gupta", st: "Progressing", due: "2026-10-25T18:00", link: "", hist: [["22 Oct", "New", "Ridhima"], ["22 Oct 11:00", "Progressing", "Sahil"]], eod: [] },
  { id: "T-1217", t: "Reel · event recap", b: "Friday Night Cars", p: "October meet", a: "Mehul Goswami", cs: "Tanisha Kumar", st: "In review", due: "2026-10-23T17:00", link: "drive.google.com/drive/fnc-recap", hist: [["21 Oct", "New", "Tanisha"], ["21 Oct 11:00", "Progressing", "Mehul"], ["23 Oct 09:30", "In review", "Mehul"]], eod: [] },
  { id: "T-1218", t: "Brand identity · round 2", b: "Rasa Group", p: "Identity", a: "Himanshu Dhondiyal", cs: "Meenakshi Baliyan", st: "Awaiting client", due: "2026-10-26T18:00", link: "drive.google.com/drive/rasa-r2", hist: [["10 Oct", "New", "Meenakshi"], ["11 Oct", "Progressing", "Himanshu"], ["16 Oct", "In review", "Himanshu"], ["17 Oct", "Awaiting client", "Meenakshi"]], eod: [], title: "Other" },
  { id: "T-1219", t: "Static posts × 8", b: "Marlin", p: "Social media · Oct", a: "Unnat Dixit", cs: "Meenakshi Baliyan", st: "Progressing", due: "2026-10-24T18:00", link: "", hist: [["22 Oct", "New", "Meenakshi"], ["22 Oct 12:00", "Progressing", "Unnat"]], eod: [] },
  { id: "T-1220", t: "Copy · October captions", b: "Adventure Tales", p: "Social media · Oct", a: "Prince Sharma", cs: "Khushi Rattan Paul", st: "New", due: "2026-10-24T13:00", link: "", hist: [["23 Oct", "New", "Khushi"]], eod: [] },
  { id: "T-1180", t: "September report deck", b: "Himalaya Opticals", p: "Social media · Sep", a: "Unnat Dixit", cs: "Jahanavi Khullar", st: "Completed", due: "2026-10-20T18:00", link: "drive.google.com/drive/himalaya-sep", hist: [["15 Oct", "New", "Jahanavi"], ["15 Oct 11:00", "Progressing", "Unnat"], ["19 Oct", "In review", "Unnat"], ["19 Oct 15:00", "Awaiting client", "Jahanavi"], ["20 Oct", "Completed · approved by client", "Jahanavi"]], eod: [], title: "Report deck", start: "15 Oct", desc: "September performance report.", attach: [["drive.google.com/drive/himalaya-sep", "Report PDF"]], rating: { stars: 5, review: "Clean and on time, thank you.", on: "20 Oct" } },
  { id: "T-1183", t: "Festive hoardings × 3", b: "Aravali One", p: "Festive", a: "Himanshu Dhondiyal", cs: "Ridhima Gupta", st: "Completed", due: "2026-10-18T18:00", link: "drive.google.com/drive/aravali-fest", hist: [["12 Oct", "New", "Ridhima"], ["13 Oct", "Progressing", "Himanshu"], ["17 Oct", "In review", "Himanshu"], ["17 Oct 16:00", "Awaiting client", "Ridhima"], ["18 Oct", "Completed", "Ridhima"]], eod: [], title: "Hoarding" },
  { id: "T-1185", t: "Reel · Dussehra", b: "Pinklam", p: "Festive", a: "Sahil Ali", cs: "Pranjal Arya", st: "Completed", due: "2026-10-19T12:00", link: "drive.google.com/drive/pinklam-dussehra", hist: [["15 Oct", "New", "Pranjal"], ["15 Oct 12:00", "Progressing", "Sahil"], ["18 Oct", "In review", "Sahil"], ["18 Oct 17:00", "Awaiting client", "Pranjal"], ["19 Oct", "Completed · approved", "Pranjal"]], eod: [], title: "Reel", serv: "Motion", desc: "Dussehra reel.", rating: { stars: 4, review: "Nice, music could be louder.", on: "19 Oct" } },
  { id: "T-1186", t: "Packaging · 1 L jar final", b: "Kisan", p: "Ghee range refresh", a: "Tripti Panchal", cs: "Bhoomika Jain", st: "Completed", due: "2026-10-17T18:00", link: "drive.google.com/drive/kisan-1l", hist: [["12 Oct", "New", "Bhoomika"], ["12 Oct 12:00", "Progressing", "Tripti"], ["16 Oct", "In review", "Tripti"], ["16 Oct 17:00", "Awaiting client", "Bhoomika"], ["17 Oct", "Completed · approved", "Bhoomika"]], eod: [], title: "Packaging dieline", serv: "Packaging", pri: "high", start: "12 Oct", desc: "1 L jar final.", attach: [["drive.google.com/drive/kisan-1l", "Print-ready"]], rating: { stars: 5, review: "", on: "17 Oct" } },
  // from cnc-client.html: fuller Himalaya history
  { id: "T-1171", t: "Reel · frames for monsoon", b: "Himalaya Opticals", p: "Social media · Sep", a: "Sahil Ali", cs: "Jahanavi Khullar", st: "Completed", due: "2026-09-26T18:00", link: "drive.google.com/drive/himalaya-monsoon-reel", hist: [["20 Sep", "New", "Jahanavi"], ["21 Sep", "Progressing", "Sahil"], ["25 Sep", "In review", "Sahil"], ["25 Sep 17:00", "Awaiting client", "Jahanavi"], ["26 Sep", "Completed · approved", "Jahanavi"]], eod: [], title: "Reel", serv: "Motion", attach: [["drive.google.com/drive/himalaya-monsoon-reel", "Final reel"]], rating: { stars: 5, review: "Loved the pacing.", on: "27 Sep" } },
  { id: "T-1175", t: "Store launch hoarding · Sector 18", b: "Himalaya Opticals", p: "Social media · Sep", a: "Himanshu Dhondiyal", cs: "Jahanavi Khullar", st: "Completed", due: "2026-09-30T18:00", link: "drive.google.com/drive/himalaya-hoarding", hist: [["25 Sep", "New", "Jahanavi"], ["25 Sep 12:00", "Progressing", "Himanshu"], ["29 Sep", "In review", "Himanshu"], ["29 Sep 17:00", "Awaiting client", "Jahanavi"], ["30 Sep", "Completed · approved", "Jahanavi"]], eod: [], title: "Hoarding", pri: "high", attach: [["drive.google.com/drive/himalaya-hoarding", "Print file"]] },
];

const REQUESTS = [
  { t: "Need a Navratri thank-you post for all handles", b: "Avani", when: "Today 7:48 am", channel: "portal", own: "Jahanavi Khullar", st: "converted", ref: "drive.google.com/drive/avani-brief", body: "Hi team, can we get a thank-you creative for Navratri across Insta, FB and LinkedIn? Copy in the brief. Need by this evening if possible.", project: "Festive 2026", deadline: "2026-10-23", poc: "Minakshi Bisht", pocContact: "98100 33445", pri: "urgent", task: "T-1203" },
  { t: "Revise logo lockup for the new packaging", b: "Marc", when: "Yesterday 4:10 pm", channel: "portal", own: "Gauri Sawhney", st: "converted", ref: "", body: "The lockup on the pouch mockup feels cramped. Can we see a horizontal version too?", project: "Packaging", deadline: "2026-10-27", poc: "Marc team", pocContact: "", pri: "normal", task: "T-1211", reply: "Sure — Himanshu is on a horizontal lockup, first look by Monday." },
  { t: "Quote for 3 product videos, 30 s each", b: "Summercool", when: "20 Oct 11:30 am", channel: "whatsapp", own: "Pranjal Arya", st: "on_hold", ref: "", body: "Looking for 3 short product videos for the new cooler range. Please share a quote and timeline.", project: null, deadline: null, poc: "Ashutosh Gupta", pocContact: "98100 55667", pri: "low", reply: "Sharing a quote once your budget for the range is confirmed." },
  { t: "Change CTA on all October posts to new website", b: "Ledvance", when: "19 Oct 2:15 pm", channel: "portal", own: "Gauri Sawhney", st: "converted", ref: "ledvance.in", body: "Website is live at the new domain, please update the CTA on scheduled posts.", project: "Social media · Oct", deadline: "2026-10-20", poc: "Priya Nair", pocContact: "", pri: "high", reply: "On it — this is now a task on your board." },
  { t: "Can we get the September report as PDF?", b: "Himalaya Opticals", when: "18 Oct 10:05 am", channel: "portal", own: "Jahanavi Khullar", st: "answered", ref: "", body: "Need the monthly report for our internal review on Monday.", project: "Social media · Sep", deadline: "2026-10-20", poc: "Neharika Binani", pocContact: "98100 11223", pri: "normal", reply: "Got it, sharing the PDF by this evening." },
  { t: "Hoarding sizes for Sector 150 site", b: "RPS Group", when: "15 Oct 6:40 pm", channel: "email", own: "Ridhima Gupta", st: "converted", ref: "drive.google.com/drive/rps-sizes", body: "Attaching the vendor size sheet. Need 6 adaptations.", project: "Tower C launch", deadline: "2026-10-25", poc: "Sameer Rana", pocContact: "98180 22334", pri: "high", task: "T-1205", reply: "Received. Six adaptations scheduled with Himanshu." },
  { t: "New festive frame launch post", b: "Himalaya Opticals", when: "Today 9:10 am", channel: "portal", own: "Jahanavi Khullar", st: "new", ref: "himalayaopticals.in/festive", body: "We're launching 6 new frames on 1 Nov — need a launch post and 3 stories.", project: "Social media · Oct", deadline: "2026-10-30", poc: "Neharika Binani", pocContact: "98100 11223", pri: "high" },
];

const INVOICES = [
  { n: 1044, b: "Himalaya Opticals", amt: 185000, issued: "2026-10-01", due: "2026-11-07", st: "sent", note: "Monthly retainer · October" },
  { n: 1043, b: "Pinklam", amt: 120000, issued: "2026-10-01", due: "2026-10-30", st: "sent", note: "Monthly retainer · October" },
  { n: 1042, b: "Thermocool", amt: 240000, issued: "2026-10-12", due: "2026-10-19", st: "paid", note: "Diwali campaign · balance 50%", paid: "2026-10-19T15:22", method: "upi" },
  { n: 1041, b: "Kisan", amt: 96000, issued: "2026-10-01", due: "2026-10-07", st: "overdue", note: "Monthly retainer · October", viewed: "2026-10-21T11:00" },
  { n: 1040, b: "Sarvagun Ayurveda", amt: 85000, issued: "2026-10-01", due: "2026-10-30", st: "sent", note: "Monthly retainer · October" },
  { n: 1039, b: "RPS Group", amt: 310000, issued: "2026-09-11", due: "2026-10-11", st: "overdue", note: "Tower C launch · milestone 2", reminders: 3 },
  { n: 1038, b: "Ledvance", amt: 150000, issued: "2026-10-01", due: "2026-10-07", st: "paid", note: "Monthly retainer · October", paid: "2026-10-06T12:00", method: "netbanking" },
  { n: 1037, b: "Trend Laminates", amt: 350000, issued: "2026-10-01", due: "2026-10-10", st: "paid", note: "Q3 retainer", paid: "2026-10-08T12:00", method: "card" },
  { n: 1036, b: "Longway", amt: 70000, issued: "2026-10-01", due: "2026-10-07", st: "paid", note: "Monthly retainer · October", paid: "2026-10-05T12:00", method: "upi" },
  { n: 1045, b: "Marc", amt: 37500, issued: null, due: null, st: "draft", note: "Packaging · 50% advance · awaiting PO" },
  { n: 1046, b: "Rasa Group", amt: 100000, issued: null, due: null, st: "draft", note: "Identity · 50% advance" },
  { n: 1031, b: "Himalaya Opticals", amt: 185000, issued: "2026-09-01", due: "2026-10-07", st: "paid", note: "Monthly retainer · September", paid: "2026-10-05T12:00", method: "upi" },
  { n: 1022, b: "Himalaya Opticals", amt: 185000, issued: "2026-08-01", due: "2026-09-07", st: "paid", note: "Monthly retainer · August", paid: "2026-09-06T12:00", method: "upi" },
];

const ANNOUNCEMENTS = [
  { type: "announcement", subject: "Diwali party · Friday 30 Oct, 6 pm", date: "2026-10-30", msg: "Rooftop, dinner on the house. Families welcome. RSVP to Nitin by Wednesday.", clients: false, by: "Nitin Chauhan", on: "23 Oct 10:02 am" },
  { type: "holiday", subject: "Diwali", date: "2026-10-20", msg: "Office closed. Sarthi keeps client digests paused.", clients: true, by: "Nitin Chauhan", on: "1 Oct", fixed: true },
  { type: "holiday", subject: "Govardhan Puja", date: "2026-10-21", msg: "Office closed.", clients: true, by: "Nitin Chauhan", on: "1 Oct", fixed: true },
  { type: "announcement", subject: "New review rule: one consolidated note per round", date: "2026-10-18", msg: "From Monday, CS sends client feedback as one note per round. Editors and designers should not receive feedback in pieces. Raised in a concern, agreed by all CS.", clients: false, by: "Jahanavi Khullar", on: "18 Oct" },
  { type: "announcement", subject: "Deliverables: images on the portal, heavy files on Drive", date: "2026-10-10", msg: "Creatives, exports and screenshots upload straight to the task. Videos, PSDs and raw shoots go on Google Drive (CNC workspace) with the link on the task. Clients see both.", clients: true, by: "Vipin Chauhan", on: "10 Oct" },
  { type: "holiday", subject: "Guru Nanak Jayanti", date: "2026-11-24", msg: "Office closed.", clients: true, by: "Nitin Chauhan", on: "1 Oct", fixed: true },
  { type: "holiday", subject: "Christmas", date: "2026-12-25", msg: "Office closed.", clients: true, by: "Nitin Chauhan", on: "1 Oct", fixed: true },
];

const CONCERNS = [
  { t: "Too many same-day tasks landing after 4 pm", by: "Unnat Dixit", cat: "workload", when: "Yesterday 6:48 pm", own: "Nitin Chauhan", st: "open", priv: true, body: "Last two weeks most Himalaya and Marlin tasks come in after 4 pm with a same-day deadline. I end up staying till 9. Can CS set a cut-off for same-day asks?", thread: [] as [string, string, string][] },
  { t: "Client calling my personal number directly", by: "Tripti Panchal", cat: "client_behaviour", when: "22 Oct 11:20 am", own: "Jahanavi Khullar", st: "in_discussion", priv: true, body: "Kisan's owner has my number from a site visit and now calls directly for changes, bypassing Bhoomika. I don't want to be rude but it's messing up the review flow.", thread: [["Jahanavi Khullar", "22 Oct 2:05 pm", "Spoke to Bhoomika, she'll reset the channel with the client this week. Please route every call back to her, I've got your back on this."]] as [string, string, string][] },
  { t: "Need a second monitor for retouching work", by: "Kasim Saifi", cat: "equipment", when: "20 Oct 10:30 am", own: "Nitin Chauhan", st: "open", priv: false, body: "40-image retouch jobs on one 24\" screen is slow. A second screen would cut this by a third.", thread: [] },
  { t: "Review feedback coming in pieces", by: "Mehul Goswami", cat: "process", when: "17 Oct 5:10 pm", own: "Jahanavi Khullar", st: "resolved", priv: false, body: "Thermocool reel got 4 separate rounds of feedback over 2 days instead of one consolidated note. Each round is a re-export.", thread: [["Jahanavi Khullar", "18 Oct 11:00 am", "Agreed. CS will now consolidate client feedback into one note per round before it reaches the editor. Added to the CS checklist."], ["Mehul Goswami", "18 Oct 11:30 am", "Thanks, that helps a lot."]], closed: "18 Oct" },
  { t: "Leave request for Diwali week not acknowledged", by: "Ankit Koli", cat: "leave", when: "14 Oct 9:15 am", own: "Nitin Chauhan", st: "resolved", priv: false, body: "Applied on 1 Oct for 20–22 Oct, no reply yet.", thread: [["Nitin Chauhan", "14 Oct 12:00 pm", "Approved, sorry for the delay. Prince covers Adventure Tales captions those days."]], closed: "14 Oct" },
  { t: "AC in the edit room", by: "Sahil Ali", cat: "workplace", when: "9 Oct 3:00 pm", own: "Nitin Chauhan", st: "resolved", priv: false, body: "Edit room hits 30° by afternoon, renders slow down and so do we.", thread: [["Nitin Chauhan", "10 Oct 10:00 am", "Serviced on 10 Oct."]], closed: "10 Oct" },
];

// Things a designer/editor/copywriter makes, for generated October history.
const WORK: Record<string, string[]> = {
  "Graphic design": ["Static post · festive offer", "Carousel · product range", "Story set · new arrivals", "Static post · testimonial", "Banner set · website", "Static post · brand day", "Carousel · how-to"],
  "Packaging design": ["Label · 500 ml", "Carton mockups", "Pouch artwork", "Shelf talker", "Label · 200 ml"],
  Copywriting: ["Captions · week 2", "Caption set · festive", "Website copy · about page", "Script · 30 s reel", "Newsletter copy", "Product descriptions × 6"],
  "Video editing": ["Reel · product demo", "Cutdown · 15 s", "Testimonial edit", "Reel · BTS"],
  "Motion design": ["Logo sting", "Animated post · offer", "Reel · typography", "Lower thirds pack"],
};

async function main() {
  if ((await db.company.count()) && !process.argv.includes("--force")) {
    console.log("Already seeded. Run `npm run db:reset` to start over.");
    return;
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("Set SEED_PASSWORD in .env");
  const pwHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  await db.company.create({ data: { legalName: "Coffee & Creative Pvt. Ltd.", brandName: "Coffee & Creative", gstin: "07AAACC1234A1Z9", address: "Sector 63", city: "Noida", state: "Uttar Pradesh", pincode: "201301", portalUrl: "app.coffeeandcreative.in" } });

  const dept = new Map<string, string>();
  for (const [i, n] of DEPTS.entries()) dept.set(n, (await db.department.create({ data: { name: n, order: i } })).id);
  const scope = new Map<string, string>();
  for (const n of SCOPE) scope.set(n, (await db.scopeOfWork.create({ data: { name: n } })).id);
  const title = new Map<string, string>();
  for (const n of TITLES) title.set(n, (await db.taskTitle.create({ data: { name: n } })).id);
  const serv = new Map<string, string>();
  for (const n of SERVICING) serv.set(n, (await db.servicingType.create({ data: { name: n } })).id);

  const STATUSES = [
    { name: "New", tone: "crimson", isStart: true }, { name: "Progressing", tone: "neutral" },
    { name: "In review", tone: "gold", isReview: true }, { name: "Review rejected", tone: "crimson", isRejected: true },
    { name: "Awaiting client", tone: "muted", isClientGate: true }, { name: "Completed", tone: "gold", isDone: true },
  ] as const;
  const status = new Map<string, string>();
  for (const [i, s] of STATUSES.entries()) status.set(s.name, (await db.taskStatus.create({ data: { ...s, order: i } })).id);

  const flagType = new Map<string, { id: string; points: number }>();
  for (const f of [{ name: "Praise", colour: "gold", points: 5, note: "+3 from CS · +5 from admin" }, { name: "Red flag", colour: "crimson", points: -8, note: "Missed commitments, repeated lateness" }, { name: "Client concern", colour: "muted", points: -10, note: "Raised from client feedback" }] as const) {
    const r = await db.flagType.create({ data: f });
    flagType.set(f.name, { id: r.id, points: f.points });
  }
  await db.scoringWeight.createMany({ data: [["on_time", 25], ["review_pass", 20], ["cs_rating", 20], ["eod", 10], ["attendance", 10], ["client_approval", 5], ["throughput", 5], ["rework", 5]].map(([parameter, weight]) => ({ parameter: parameter as never, weight: weight as number })) });

  // ---- people ----
  const user = new Map<string, string>();
  const byFirst = new Map<string, string>();
  for (const [i, p] of PEOPLE.entries()) {
    const [first, ...rest] = p.n.split(" ");
    const login = ("login" in p && p.login) || first.toLowerCase();
    const mobile = `98100 ${String(10 + i).padStart(5, "0")}`;
    const u = await db.user.create({
      data: {
        firstName: first, lastName: rest.join(" "), email: ("email" in p && p.email) || `${login}@coffeeandcreative.in`, loginId: login,
        passwordHash: pwHash, role: p.role, departmentId: dept.get(p.dept),
        designation: ("desig" in p && p.desig) || (p.role === "cs" ? "Client Servicing Executive" : p.dept === "Copywriting" ? "Copywriter" : p.dept === "Video editing" ? "Video editor" : p.dept === "Motion design" ? "Motion designer" : p.dept === "Packaging design" ? "Packaging designer" : "Graphic designer"),
        gender: "gender" in p ? p.gender : null, mobile, whatsappNo: mobile, city: "Noida", state: "Uttar Pradesh",
        address: "addr" in p ? p.addr : null, pincode: "pin" in p ? p.pin : null, linkedin: "li" in p ? p.li : null,
        invitedAt: at("2026-09-01"),
      },
    });
    user.set(p.n, u.id);
    byFirst.set(first, u.id);
  }
  const admin = user.get("Vipin Chauhan")!;

  await db.setting.createMany({
    data: [
      { key: "payment_terms_options", value: ["7th of every month", "30 days", "50% advance, 50% on delivery", "Quarterly in advance", "On receipt", "Advance"] },
      { key: "digest_time", value: "09:00" }, { key: "nudge_interval_hours", value: 2 }, { key: "eod_chase_time", value: "19:30" },
      { key: "reminder_schedule", value: { before_days: 3, on_due: true, every_days: 5 } },
      { key: "praise_cs_points", value: 3 }, { key: "praise_admin_points", value: 5 },
      { key: "score_visible_to_employee", value: true }, { key: "hr_user_id", value: user.get("Nitin Chauhan")! },
      { key: "submit_requires_attachment", value: true }, { key: "client_rejection_creates_flag", value: false },
      { key: "sarthi_automations", value: { digest: true, nudges: true, qa: true, invoice_reminders: true, eod_chaser: true, weekly_note: false } },
    ],
  });

  // ---- brands + client logins ----
  const brand = new Map<string, string>();
  const clientUser = new Map<string, string>();
  for (const b of BRANDS) {
    const r = await db.brand.create({
      data: {
        name: b.n, companyName: b.company ?? b.n, division: b.division, address: b.address, city: b.city ?? "Delhi", state: b.state ?? "Delhi", pincode: b.pincode,
        frequency: b.type, paymentTerms: b.terms, officialEmail: b.officialEmail, whatsapp: b.whatsapp, website: b.website, instagram: b.instagram, linkedin: b.linkedin,
        pocName: b.poc, pocPhone: b.pocPhone, gstin: b.gst, additionalInformation: b.additional, sinceYear: b.since, feeNote: b.fee, createdBy: admin,
        preferences: { daily_digest: true, approval_pings: true, invoice_emails: true, weekly_summary: false, sarthi_qa: true },
        cs: { create: b.cs.map((n, i) => ({ userId: user.get(n)!, isPrimary: i === 0 })) },
        scope: { create: b.scope.map((s) => ({ scopeOfWorkId: scope.get(s)! })) },
      },
    });
    brand.set(b.n, r.id);
    const slug = b.n.toLowerCase().replace(/[^a-z]/g, "");
    const pocName = b.poc && b.poc !== "Marc team" ? b.poc : `${b.n} Team`;
    const [first, ...rest] = pocName.split(" ");
    const cu = await db.user.create({
      data: {
        firstName: first, lastName: rest.join(" "), email: b.loginEmail ?? `${slug}@client.coffeeandcreative.in`, loginId: `client-${slug}`,
        passwordHash: pwHash, role: "client", brandId: r.id, designation: `Client · ${b.n}`, mobile: b.pocPhone, whatsappNo: b.whatsapp ?? b.pocPhone, invitedAt: at("2026-09-01"),
      },
    });
    clientUser.set(b.n, cu.id);
  }

  // ---- projects ----
  const project = new Map<string, string>();
  const projectKey = (b: string, n: string) => `${b}|${n}`;
  for (const p of PROJECTS) {
    const r = await db.project.create({
      data: {
        brandId: brand.get(p.b)!, name: p.n, brandPoc: p.poc, pocPhone: p.pocPhone, type: p.type, subType: p.sub, description: p.desc,
        startDate: dOnly(p.start), deadline: dOnly(p.deadline), referenceLink1: p.refs[0] ? `https://${p.refs[0]}` : null, referenceLink2: p.refs[1] ? `https://${p.refs[1]}` : null,
        paymentTerms: p.terms, priority: p.pri, statusId: status.get(p.st)!, createdBy: admin,
        scope: { create: p.scope.map((s) => ({ scopeOfWorkId: scope.get(s)! })) },
      },
    });
    project.set(projectKey(p.b, p.n), r.id);
    for (const [who, when, body] of p.comments ?? []) {
      await db.projectComment.create({ data: { projectId: r.id, userId: user.get(who)!, body, createdAt: mockWhen(when), visibleToClient: true } });
    }
  }
  async function ensureProject(b: string, n: string, type = "Social media") {
    const k = projectKey(b, n);
    if (!project.has(k)) {
      const r = await db.project.create({ data: { brandId: brand.get(b)!, name: n, type, subType: "", statusId: status.get("Progressing")!, startDate: dOnly("2026-10-01"), deadline: dOnly("2026-10-31"), paymentTerms: BRANDS.find((x) => x.n === b)?.terms, createdBy: admin } });
      project.set(k, r.id);
    }
    return project.get(k)!;
  }

  // ---- tasks (sample) ----
  const taskId = new Map<string, string>();
  for (const t of TASKS) {
    const csId = user.get(t.cs)!;
    const assignees = t.assignees ?? [t.a];
    const firstHist = mockWhen(t.hist[0][0]);
    const [dk, tk] = t.due.split("T");
    const deadline = at(dk, tk);
    const hist = t.hist.map(([when, text, who]) => {
      const [stName, ...noteParts] = text.split(" · ");
      return { at: mockWhen(when), st: stName.trim(), note: noteParts.join(" · ") || null, by: byFirst.get(who) ?? csId };
    });
    const submitted = [...hist].reverse().find((h) => h.st === "In review")?.at ?? null;
    const started = hist.find((h) => h.st === "Progressing")?.at ?? null;
    const completed = hist.find((h) => h.st === "Completed")?.at ?? null;
    const titleName = t.title ?? (/reel/i.test(t.t) ? "Reel" : /copy/i.test(t.t) ? "Copy" : /hoarding/i.test(t.t) ? "Hoarding" : /packaging|dieline/i.test(t.t) ? "Packaging dieline" : /story/i.test(t.t) ? "Story set" : /post|carousel/i.test(t.t) ? "Static post" : "Other");
    const servName = t.serv ?? (/copy/i.test(t.t) ? "Copy" : /reel|video/i.test(t.t) ? "Video" : "Design");
    const r = await db.task.create({
      data: {
        brandId: brand.get(t.b)!, projectId: await ensureProject(t.b, t.p), titleId: title.get(titleName)!, name: t.t, description: t.desc ?? null,
        servicingTypeId: serv.get(servName), priority: t.pri ?? "normal", startDate: t.start ? mockDate(t.start) : new Date(`${istDateKey(firstHist)}T00:00:00Z`),
        code: Number(t.id.slice(2)), deadlineAt: deadline, statusId: status.get(t.st)!, csUserId: csId, createdById: hist[0].by, createdAt: firstHist,
        startedAt: started, submittedAt: submitted, completedAt: completed,
        assignees: { create: assignees.map((n, i) => ({ userId: user.get(n)!, departmentId: dept.get(PEOPLE.find((p) => p.n === n)!.dept), isLead: i === 0 })) },
      },
    });
    taskId.set(t.id, r.id);
    let prev: string | null = null;
    for (const h of hist) {
      await db.taskStatusHistory.create({ data: { taskId: r.id, fromStatusId: prev, toStatusId: status.get(h.st)!, byUserId: h.by, note: h.note, at: h.at } });
      prev = status.get(h.st)!;
    }
    const attach = t.attach ?? (t.link ? [[t.link, "Deliverable"] as [string, string]] : []);
    for (const [url, label] of attach) {
      await db.taskAttachment.create({ data: { taskId: r.id, kind: "link", url: `https://${url}`, label, uploadedBy: user.get(t.a), visibleToClient: true, createdAt: submitted ?? firstHist } });
    }
    for (const [who, when, body] of t.comments ?? []) {
      await db.taskComment.create({ data: { taskId: r.id, userId: user.get(who)!, body, createdAt: mockWhen(when) } });
    }
    for (const line of t.eod) {
      const [d, ...rest] = line.split(" · ");
      await db.eodLog.create({ data: { userId: user.get(t.a)!, taskId: r.id, date: mockDate(d), remark: rest.join(" · "), statusAtTime: "Progressing" } });
    }
    if (t.rating) {
      await db.taskRating.create({ data: { taskId: r.id, ratedByUserId: clientUser.get(t.b)!, raterKind: "client", stars: t.rating.stars, review: t.rating.review || null, at: mockWhen(t.rating.on, "18:00") } });
    }
    if (t.st === "Completed") {
      await db.taskRating.create({ data: { taskId: r.id, ratedByUserId: csId, raterKind: "cs", stars: t.rating?.stars ?? 5, at: completed! } });
    }
  }

  // ---- generated October history per employee (feeds the score) ----
  // Older work gets lower numbers than the mockup's sample tasks (T-1171+).
  await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('task','code'), 1000)`);
  const monthStart = istMonthDate(NOW);
  const histStart = new Date(`${monthStart.toISOString().slice(0, 10)}T00:00:00+05:30`);
  const yesterday = new Date(`${TODAY}T00:00:00+05:30`).getTime() - DAY_MS;
  for (const p of PEOPLE) {
    if (p.role !== "employee") continue;
    const st = p.stats;
    const open = TASKS.filter((t) => (t.assignees ?? [t.a]).includes(p.n) && t.st !== "Completed").length;
    const n = Math.max(2, st.tasks - open);
    const brandsFor = BRANDS.filter((b) => b.n !== "Summercool");
    for (let i = 0; i < n; i++) {
      const b = pick(brandsFor);
      const span = Math.max(DAY_MS * 3, yesterday - histStart.getTime() - DAY_MS * 2);
      const created = new Date(histStart.getTime() + Math.floor(rnd() * (span / DAY_MS)) * DAY_MS + 10 * 3_600_000);
      const deadline = new Date(created.getTime() + (2 + Math.floor(rnd() * 3)) * DAY_MS + 8 * 3_600_000);
      const onTime = rnd() * 100 < st.ontime;
      const passed = rnd() * 100 < st.pass;
      const started = new Date(created.getTime() + 3_600_000);
      let submittedAt = new Date(onTime ? deadline.getTime() - (2 + rnd() * 20) * 3_600_000 : deadline.getTime() + (2 + rnd() * 20) * 3_600_000);
      if (submittedAt <= started) submittedAt = new Date(started.getTime() + 4 * 3_600_000);
      const steps: [string, Date][] = [["New", created], ["Progressing", started]];
      if (!passed) {
        const firstSub = new Date(started.getTime() + (submittedAt.getTime() - started.getTime()) * 0.6);
        steps.push(["In review", firstSub], ["Review rejected", new Date(firstSub.getTime() + 2 * 3_600_000)], ["Progressing", new Date(firstSub.getTime() + 3 * 3_600_000)]);
      }
      steps.push(["In review", submittedAt]);
      const gate = new Date(submittedAt.getTime() + (1 + rnd() * 5) * 3_600_000);
      const clientOk = rnd() < 0.85;
      steps.push(["Awaiting client", gate]);
      if (!clientOk) steps.push(["Review rejected", new Date(gate.getTime() + 5 * 3_600_000)], ["Progressing", new Date(gate.getTime() + 6 * 3_600_000)], ["In review", new Date(gate.getTime() + 10 * 3_600_000)], ["Awaiting client", new Date(gate.getTime() + 12 * 3_600_000)]);
      const done = new Date(steps[steps.length - 1][1].getTime() + (2 + rnd() * 18) * 3_600_000);
      if (done.getTime() > yesterday + DAY_MS) continue;
      steps.push(["Completed", done]);
      const csName = b.cs[0];
      const name = pick(WORK[p.dept] ?? WORK["Graphic design"]);
      const r = await db.task.create({
        data: {
          brandId: brand.get(b.n)!, projectId: await ensureProject(b.n, "Social media · Oct"), titleId: title.get(/copy|caption|script/i.test(name) ? "Copy" : /reel|cutdown|edit|sting|animated/i.test(name) ? "Reel" : /label|carton|pouch|shelf/i.test(name) ? "Packaging dieline" : "Static post")!,
          name, servicingTypeId: serv.get(p.dept === "Copywriting" ? "Copy" : p.dept === "Video editing" ? "Video" : p.dept === "Motion design" ? "Motion" : p.dept === "Packaging design" ? "Packaging" : "Design"),
          startDate: new Date(`${istDateKey(created)}T00:00:00Z`), deadlineAt: deadline, statusId: status.get("Completed")!, csUserId: user.get(csName)!, createdById: user.get(csName),
          createdAt: created, startedAt: started, submittedAt, completedAt: done,
          assignees: { create: [{ userId: user.get(p.n)!, departmentId: dept.get(p.dept), isLead: true }] },
          attachments: { create: [{ kind: "link", url: `https://drive.google.com/drive/${b.n.toLowerCase().replace(/[^a-z]/g, "")}-${i + 1}`, label: "Final", visibleToClient: true }] },
        },
      });
      let prev: string | null = null;
      for (const [s, when] of steps) {
        await db.taskStatusHistory.create({ data: { taskId: r.id, fromStatusId: prev, toStatusId: status.get(s)!, byUserId: s === "Progressing" || s === "In review" ? user.get(p.n) : s === "Completed" || (s === "Review rejected" && prev === status.get("Awaiting client")) ? clientUser.get(b.n) : user.get(csName), at: when, note: s === "Review rejected" ? pick(["Tighten the headline, logo bigger", "Colours off-brand, use the warm palette", "Cut is long, trim 5 s", "Typo in line 2"]) : null } });
        prev = status.get(s)!;
      }
      const stars = Math.max(1, Math.min(5, Math.round(st.cs + (rnd() - 0.5) * 1.2)));
      await db.taskRating.create({ data: { taskId: r.id, ratedByUserId: user.get(csName)!, raterKind: "cs", stars, at: done } });
      if (rnd() < 0.5) await db.taskRating.create({ data: { taskId: r.id, ratedByUserId: clientUser.get(b.n)!, raterKind: "client", stars: Math.min(5, stars + (rnd() < 0.5 ? 0 : 1)), at: done } });
      // EOD lines while it was active, per the person's EOD discipline.
      for (let d = new Date(started); d < done; d = new Date(d.getTime() + DAY_MS)) {
        if ((istParts(d).dow || 7) === 7) continue;
        if (rnd() * 100 < st.eod) await db.eodLog.upsert({ where: { userId_taskId_date: { userId: user.get(p.n)!, taskId: r.id, date: new Date(`${istDateKey(d)}T00:00:00Z`) } }, create: { userId: user.get(p.n)!, taskId: r.id, date: new Date(`${istDateKey(d)}T00:00:00Z`), remark: pick(["First pass done", "Revisions in, exporting", "Shared draft with CS", "Final tweaks, ready tomorrow"]), statusAtTime: "Progressing" }, update: {} });
      }
    }
  }

  // ---- requests ----
  let reqCode = 300;
  for (const r of REQUESTS) {
    const when = mockWhen(r.when);
    const ownerId = user.get(r.own)!;
    const req = await db.workRequest.create({
      data: {
        code: ++reqCode, brandId: brand.get(r.b)!, projectId: r.project ? project.get(projectKey(r.b, r.project)) ?? null : null, subject: r.t, description: r.body, date: when,
        referenceLink: r.ref ? `https://${r.ref}` : null, neededBy: r.deadline ? dOnly(r.deadline) : null, pocName: r.poc, pocContact: r.pocContact || null,
        priority: r.pri as Priority, status: r.st as never, ownerUserId: ownerId, convertedTaskId: r.task ? taskId.get(r.task) : null,
        raisedByUserId: r.channel === "portal" ? clientUser.get(r.b) : ownerId, channel: r.channel, createdAt: when,
        firstReplyAt: r.reply ? new Date(when.getTime() + 38 * 60_000) : null,
      },
    });
    if (r.reply) await db.workRequestReply.create({ data: { workRequestId: req.id, userId: ownerId, body: r.reply, at: new Date(when.getTime() + 38 * 60_000) } });
    if (r.task) await db.task.update({ where: { id: taskId.get(r.task)! }, data: { sourceRequestId: req.id } });
  }

  // ---- invoices ----
  for (const i of INVOICES) {
    const sub = BigInt(i.amt * 100);
    const gst = (sub * BigInt(18)) / BigInt(100);
    const fixedDates = (k: string | null) => (k ? dOnly(k) : null);
    const inv = await db.invoice.create({
      data: {
        number: i.n, brandId: brand.get(i.b)!, issueDate: fixedDates(i.issued), dueDate: fixedDates(i.due), subtotalPaise: sub, gstRate: 18, gstPaise: gst, totalPaise: sub + gst,
        notes: i.note, status: i.st as never, razorpayLinkId: i.st === "draft" ? null : `plink_demo_${i.n}`,
        razorpayShortUrl: i.st === "draft" ? null : `/pay/mock/PENDING`,
        sentAt: i.issued ? at(i.issued, "11:00") : null, viewedAt: "viewed" in i && i.viewed ? at(i.viewed.slice(0, 10), i.viewed.slice(11)) : null,
        paidAt: "paid" in i && i.paid ? at(i.paid.slice(0, 10), i.paid.slice(11)) : null, createdById: admin,
        items: { create: [{ description: i.note, qty: 1, unitPaise: sub, amountPaise: sub }] },
      },
    });
    await db.invoice.update({ where: { id: inv.id }, data: { razorpayShortUrl: i.st === "draft" ? null : `/pay/mock/${inv.id}` } });
    const ev: Prisma.InvoiceEventCreateManyInput[] = [{ invoiceId: inv.id, kind: "created", byUserId: admin, at: i.issued ? at(i.issued, "10:30") : at(MOCK_TODAY, "09:00") }];
    if (i.issued) ev.push({ invoiceId: inv.id, kind: "sent", byUserId: admin, at: at(i.issued, "11:00"), meta: { channels: ["portal", "email", "whatsapp"] } });
    if ("viewed" in i && i.viewed) ev.push({ invoiceId: inv.id, kind: "viewed", at: at(i.viewed.slice(0, 10), i.viewed.slice(11)), meta: { opens: 2 } });
    for (let k = 0; k < (("reminders" in i && i.reminders) || 0); k++) ev.push({ invoiceId: inv.id, kind: "reminder", at: at(MOCK_TODAY, "10:00").getTime() - (2 - k) * 5 * DAY_MS > 0 ? new Date(at(MOCK_TODAY, "10:00").getTime() - (2 - k) * 5 * DAY_MS) : at(MOCK_TODAY), meta: { n: k + 1, via: "sarthi" } });
    if ("paid" in i && i.paid) {
      const paidAt = at(i.paid.slice(0, 10), i.paid.slice(11));
      ev.push({ invoiceId: inv.id, kind: "paid", at: paidAt, meta: { method: i.method } });
      await db.payment.create({ data: { invoiceId: inv.id, amountPaise: sub + gst, method: i.method as never, razorpayPaymentId: `pay_demo_${i.n}`, razorpaySignatureOk: true, receivedAt: paidAt } });
    }
    ev.forEach((e) => { e.at = past(new Date(e.at as Date)); });
    await db.invoiceEvent.createMany({ data: ev });
  }

  // ---- announcements ----
  for (const a of ANNOUNCEMENTS) {
    await db.announcement.create({
      data: { type: a.type as never, subject: a.subject, date: a.fixed ? new Date(`${a.date}T00:00:00Z`) : dOnly(a.date), message: a.msg, showToClients: a.clients, postedById: user.get(a.by), createdAt: mockWhen(a.on), broadcast: a.type === "announcement" },
    });
  }

  // ---- concerns ----
  for (const c of CONCERNS) {
    const created = mockWhen(c.when);
    const con = await db.concern.create({
      data: {
        raisedByUserId: user.get(c.by)!, category: c.cat as never, subject: c.t, details: c.body, confidential: c.priv, ownerUserId: user.get(c.own)!,
        status: c.st as never, resolvedAt: "closed" in c && c.closed ? mockWhen(c.closed, "18:00") : null, createdAt: created,
      },
    });
    for (const [who, when, body] of c.thread) await db.concernReply.create({ data: { concernId: con.id, userId: user.get(who)!, body, at: mockWhen(when) } });
  }

  // ---- flags ----
  const month = istMonthDate(NOW);
  const FLAGS = [
    { who: "Himanshu Dhondiyal", type: "Praise", by: "Vipin Chauhan", subject: "Himalaya calendar delivered a day early", feedback: "Whole October calendar in before the deadline, zero rework.", brand: "Himalaya Opticals", on: "21 Oct" },
    { who: "Himanshu Dhondiyal", type: "Praise", by: "Vipin Chauhan", subject: "Client loved the Trend catalogue", feedback: "Vikram called personally to say the cover options were the best yet.", brand: "Trend Laminates", on: "15 Oct" },
    { who: "Tripti Panchal", type: "Praise", by: "Bhoomika Jain", subject: "Kisan 1 L final in one round", feedback: "Approved first time by the client.", brand: "Kisan", on: "17 Oct" },
    { who: "Kasim Saifi", type: "Red flag", by: "Jahanavi Khullar", subject: "Missed 2 EOD reports, late logins", feedback: "Two EODs missed this week and three logins after 10:30. Please talk to me if something's up.", brand: null, on: "20 Oct" },
    { who: "Jahanavi Khullar", type: "Praise", by: "Vipin Chauhan", subject: "Himalaya renewal closed early", feedback: "Renewal signed a week ahead of the deadline.", brand: "Himalaya Opticals", on: "15 Oct", cs: true },
    { who: "Ridhima Gupta", type: "Red flag", by: "Vipin Chauhan", subject: "RPS feedback reached design in 4 pieces", feedback: "Consolidate client feedback into one note per round.", brand: "RPS Group", on: "18 Oct", cs: true },
    { who: "Bhoomika Jain", type: "Praise", by: "Nitin Chauhan", subject: "Kisan client praised turnaround", feedback: "Client mentioned the speed of the 1 L jar round.", brand: "Kisan", on: "17 Oct", cs: true },
  ];
  for (const f of FLAGS) {
    const ft = flagType.get(f.type)!;
    const giverRole = PEOPLE.find((p) => p.n === f.by)!.role;
    const pts = f.type === "Praise" ? (giverRole === "cs" ? 3 : 5) : ft.points;
    await db.flag.create({ data: { flagTypeId: ft.id, targetUserId: user.get(f.who)!, targetRole: f.cs ? "cs" : "employee", givenByUserId: user.get(f.by)!, brandId: f.brand ? brand.get(f.brand) : null, subject: f.subject, feedback: f.feedback, pointsApplied: pts, month, createdAt: mockWhen(f.on, "17:00") } });
  }

  // ---- leave ----
  await db.leaveRequest.create({ data: { userId: user.get("Tanisha Kumar")!, fromDate: dOnly(MOCK_TODAY), toDate: dOnly("2026-10-24"), type: "casual", reason: "Family function", status: "approved", decidedBy: user.get("Nitin Chauhan"), decidedAt: at("2026-10-20") } });
  await db.leaveRequest.create({ data: { userId: user.get("Ankit Koli")!, fromDate: new Date("2026-10-20T00:00:00Z"), toDate: new Date("2026-10-22T00:00:00Z"), type: "casual", reason: "Diwali at home", status: "approved", decidedBy: user.get("Nitin Chauhan"), decidedAt: mockWhen("14 Oct 12:00 pm") } });

  // ---- attendance: sessions for every working day this month up to yesterday, plus today so far ----
  const staff = PEOPLE;
  const company = await db.company.findFirst();
  const holidays = new Set((await db.announcement.findMany({ where: { type: "holiday" } })).map((h) => h.date.toISOString().slice(0, 10)));
  for (let t = histStart.getTime(); t <= Date.parse(`${TODAY}T00:00:00+05:30`); t += DAY_MS) {
    const d = new Date(t);
    const key = istDateKey(d);
    const dow = istParts(d).dow || 7;
    if (!company!.workingDays.includes(dow) || holidays.has(key)) continue;
    const isToday = key === TODAY;
    for (const p of staff) {
      const uid = user.get(p.n)!;
      const stats = "stats" in p ? p.stats : { att: 97 };
      let loginMin: number;
      if (isToday) {
        if (!p.in) continue;
        const [h, m] = p.in.split(":").map(Number);
        loginMin = h * 60 + m;
      } else {
        if (rnd() * 100 > stats.att + 2) continue; // absent
        loginMin = 9 * 60 + Math.floor(rnd() * 70) + (rnd() * 100 > stats.att ? 45 : 0);
      }
      const loginAt = new Date(`${key}T${pad(Math.floor(loginMin / 60))}:${pad(loginMin % 60)}:00+05:30`);
      if (loginAt > NOW) continue;
      const auto = !isToday && rnd() < 0.04;
      const logoutMin = 18 * 60 + 30 + Math.floor(rnd() * 135);
      const logoutAt = isToday ? null : auto ? new Date(`${key}T23:59:59+05:30`) : new Date(`${key}T${pad(Math.floor(logoutMin / 60))}:${pad(logoutMin % 60)}:00+05:30`);
      await db.attendanceSession.create({ data: { userId: uid, loginAt, logoutAt, autoLogout: auto, ip: "10.0.0." + (10 + staff.indexOf(p)), userAgent: "Chrome / macOS" } });
    }
  }
  for (let t = histStart.getTime(); t < Date.parse(`${TODAY}T00:00:00+05:30`); t += DAY_MS) await closeDay(istDateKey(new Date(t)));
  for (const p of staff) await materialiseDay(user.get(p.n)!, TODAY);

  // ---- notifications ----
  const N = [
    { u: admin, module: "task", title: "Tripti Panchal moved Kisan dieline v4 to In review", link: "/admin/tasks", when: -2 * 60_000, read: false },
    { u: admin, module: "request", title: "Himalaya Opticals raised a work request: New festive frame launch post", link: "/admin/requests", when: -60 * 60_000, read: false },
    { u: admin, module: "concern", title: "Unnat Dixit raised a concern (confidential)", link: "/admin/concerns", when: -16 * 3_600_000, read: false },
    { u: admin, module: "invoice", title: "Thermocool paid INV-1042 · ₹2,83,200 via Razorpay", link: "/admin/money", when: -4 * DAY_MS, read: true },
    { u: admin, module: "approval", title: "Himalaya Opticals approved September report deck", link: "/admin/tasks", when: -3 * DAY_MS, read: true },
    { u: admin, module: "flag", title: "Jahanavi Khullar red-flagged Kasim Saifi", link: "/admin/team", when: -3 * DAY_MS, read: true },
    { u: clientUser.get("Himalaya Opticals")!, module: "approval", title: "Frame inspiration carousel is ready for your approval", link: "/client/approvals", when: -16 * 3_600_000, read: false },
    { u: clientUser.get("Himalaya Opticals")!, module: "request", title: "Jahanavi replied on “September report as PDF”", link: "/client/requests", when: -5 * DAY_MS, read: false },
    { u: clientUser.get("Himalaya Opticals")!, module: "invoice", title: "INV-1044 · ₹2,18,300 due " + istDateKey(dOnly("2026-11-07")).slice(8) + " Nov", link: "/client/money", when: -22 * DAY_MS, read: false },
    { u: clientUser.get("Himalaya Opticals")!, module: "task", title: "September report deck delivered", link: "/client/work", when: -3 * DAY_MS, read: true },
  ] as const;
  for (const n of N) await db.notification.create({ data: { userId: n.u, module: n.module, event: "seed", title: n.title, link: n.link, emittedAt: new Date(NOW.getTime() + n.when), readAt: n.read ? NOW : null } });

  // ---- Sarthi agent access (§10.2) ----
  await db.agentAccess.create({
    data: {
      agentName: "sarthi", dbRole: "sarthi_ro", enabled: true, webhookUrl: process.env.SARTHI_WEBHOOK_URL || null, webhookSecret: null,
      allowedQueries: [
        { name: "tasks_by_brand", params: ["brand"], sql: "select * from v_tasks where brand = $1 and status_label <> 'Done' order by deadline_at" },
        { name: "overdue_tasks", params: [], sql: "select * from v_tasks where is_late order by deadline_at" },
        { name: "task_status", params: ["task_name"], sql: "select * from v_tasks where name ilike '%' || $1 || '%' limit 5" },
        { name: "invoices_outstanding", params: [], sql: "select * from v_invoices where status in ('sent','viewed','overdue')" },
        { name: "who_is_in_today", params: [], sql: "select * from v_attendance_days where date = (now() at time zone 'Asia/Kolkata')::date" },
        { name: "my_tasks", params: ["user"], sql: "select * from v_tasks where $1 = any(assignee_ids)" },
      ],
    },
  });

  // Keep human-facing numbers in the mockup's ranges, and move every sequence past the seeded rows.
  await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('task','code'), (SELECT max(code) FROM task))`);
  for (const [table, col] of [["project", "code"], ["work_request", "code"], ["concern", "code"], ["announcement", "code"], ["invoice", "number"]]) {
    await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${table}','${col}'), (SELECT max(${col}) FROM ${table}))`);
  }
  await db.auditLog.create({ data: { actorKind: "system", action: "seed.demo", entityType: "system", entityId: null, after: { shiftDays: SHIFT } } });

  const scored = await computeScores(NOW);
  console.log(`Seeded. Mockup day shifted by ${SHIFT} d to ${TODAY}. Scored ${scored} people.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

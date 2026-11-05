import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { brandStats } from "@/lib/brand-stats";
import { brandScope, lateTaskWhere, name, statuses, taskScope, teamScope } from "@/lib/queries";
import { fmtDate, fmtDue, fmtTime, fmtWhen, greeting, istMonthDate, istParts, istStartOfDay, istStartOfMonth, latenessParts, monthName, DAY_MS } from "@/lib/time";
import { inr, lakh } from "@/lib/money";
import { FLAG_CLASS, INVOICE_CLASS, INVOICE_LABEL, REQUEST_CLASS, REQUEST_LABEL, toneClass } from "@/lib/status";
import { Flag, Pill, Ring } from "@/components/ui";

export const metadata = { title: "Today" };

const WORDS = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things", "Seven things", "Eight things", "Nine things", "Ten things"];

export default async function Today() {
  const u = await requireUser(["admin", "group_admin"]);
  const ga = u.role === "group_admin";
  const now = new Date();
  // Group admins see their group only (hierarchy); the super admin sees everything.
  const [T, B, team] = await Promise.all([taskScope(u), brandScope(u), teamScope(u)]);
  const t = (w: Prisma.TaskWhereInput): Prisma.TaskWhereInput => ({ AND: [w, T] });
  const inB = B ? { brandId: { in: B } } : {};
  const inTeam = team ? { id: { in: team } } : {};
  const uTeam = team ? { userId: { in: team } } : {};
  // Invoices stay with the super admin; a group admin's Today has no money blocks.
  const dayStart = istStartOfDay(now), dayEnd = new Date(dayStart.getTime() + DAY_MS), monthStart = istStartOfMonth(now);
  const lateWhere = await lateTaskWhere(now);

  const [sts, openCount, openBrands, late, dueToday, gate, newReqs, invoices, concerns, scores, staff, sessions, reqs, lastQa, outboxToday, answersToday, digestBrands] = await Promise.all([
    statuses(),
    db.task.count({ where: t({ status: { isDone: false } }) }),
    db.task.groupBy({ by: ["brandId"], where: t({ status: { isDone: false } }) }),
    db.task.findMany({ where: t(lateWhere), include: { brand: true, status: true, cs: true, assignees: { include: { user: true } }, history: { orderBy: { at: "desc" }, take: 1, include: { by: true } } }, orderBy: { deadlineAt: "asc" } }),
    db.task.findMany({ where: t({ deadlineAt: { gte: dayStart, lt: dayEnd }, status: { isDone: false } }), select: { deadlineAt: true } }),
    db.task.count({ where: t({ status: { isClientGate: true } }) }),
    db.workRequest.findMany({ where: { status: "new", ...inB }, select: { brandId: true } }),
    db.invoice.findMany({ where: { status: { not: "void" }, ...(ga ? { brandId: { in: [] } } : {}) }, include: { brand: true, events: { orderBy: { at: "desc" } } }, orderBy: { updatedAt: "desc" } }),
    ga ? Promise.resolve(0) : db.concern.count({ where: { status: "open" } }),
    db.performanceScore.findMany({ where: { month: istMonthDate(now), user: { role: "employee", status: "active", ...inTeam } }, include: { user: { include: { department: true, flagsReceived: { where: { month: istMonthDate(now) }, include: { type: true } } } } }, orderBy: { score: "desc" }, take: 7 }),
    db.user.findMany({ where: { role: { in: ga ? ["cs", "employee"] : ["admin", "group_admin", "cs", "employee"] }, status: "active", ...inTeam } }),
    db.attendanceSession.findMany({ where: { loginAt: { gte: dayStart, lt: dayEnd }, ...uTeam }, include: { user: true }, orderBy: { loginAt: "asc" } }),
    db.workRequest.findMany({ where: inB, include: { brand: true, owner: true, attachments: true }, orderBy: { date: "desc" }, take: 3 }),
    db.auditLog.findFirst({ where: { action: "agent.answer", ...(ga ? { actorUserId: u.id } : {}) }, orderBy: { at: "desc" } }),
    db.eventOutbox.findMany({ where: { createdAt: { gte: dayStart } }, select: { event: true } }),
    db.auditLog.count({ where: { action: "agent.answer", at: { gte: dayStart } } }),
    db.brand.count({ where: { status: "active", preferences: { path: ["daily_digest"], equals: true }, ...(B ? { id: { in: B } } : {}) } }),
  ]);
  const stats = await brandStats(B ?? undefined);
  const company = await db.company.findFirst();

  const outstanding = invoices.filter((i) => ["sent", "viewed", "overdue"].includes(i.status));
  const outstandingSum = outstanding.reduce((s, i) => s + i.totalPaise, BigInt(0));
  const overdueSum = outstanding.filter((i) => i.status === "overdue").reduce((s, i) => s + i.totalPaise, BigInt(0));
  // The month's book: issued this month, anything still unpaid, and anything paid this month.
  const monthFirst = new Date(Date.UTC(istParts(now).y, istParts(now).m, 1));
  const book = invoices.filter((i) => i.status !== "draft" && ((i.issueDate && i.issueDate >= monthFirst) || ["sent", "viewed", "overdue"].includes(i.status) || (i.paidAt && i.paidAt >= monthStart)));
  const sum = (xs: typeof book) => xs.reduce((s, i) => s + i.totalPaise, BigInt(0));
  const billed = sum(book);
  const collected = sum(book.filter((i) => i.status === "paid"));
  const monthDue = sum(book.filter((i) => i.status === "sent" || i.status === "viewed"));
  const pct = (a: bigint) => (billed ? Math.round((Number(a) / Number(billed)) * 100) : 0);
  const before2 = dueToday.filter((t) => istParts(t.deadlineAt).h < 14).length;
  const oldestLate = late[0] ? latenessParts(late[0].deadlineAt, now) : null;

  // Attendance today: first login per staff member.
  const firstIn = new Map<string, Date>();
  sessions.forEach((s) => { if (!firstIn.has(s.userId)) firstIn.set(s.userId, s.loginAt); });
  const [lh, lm] = (company?.lateLoginAfter ?? "10:30").split(":").map(Number);
  const isLate = (d: Date) => istParts(d).h * 60 + istParts(d).min > lh * 60 + lm;
  const workingToday = (company?.workingDays ?? [1, 2, 3, 4, 5, 6]).includes(istParts(now).dow || 7);
  const holiday = await db.announcement.findFirst({ where: { type: "holiday", date: new Date(Date.UTC(istParts(now).y, istParts(now).m, istParts(now).d)), archivedAt: null } });
  const onLeave = new Set((await db.leaveRequest.findMany({ where: { status: "approved", fromDate: { lte: new Date(Date.UTC(istParts(now).y, istParts(now).m, istParts(now).d)) }, toDate: { gte: new Date(Date.UTC(istParts(now).y, istParts(now).m, istParts(now).d)) } } })).map((l) => l.userId));
  const attRows = [
    ...staff.filter((s) => firstIn.has(s.id)).sort((a, b) => firstIn.get(a.id)!.getTime() - firstIn.get(b.id)!.getTime()),
    ...staff.filter((s) => !firstIn.has(s.id) && s.role !== "admin"),
  ].slice(0, 6);
  const yest = await db.attendanceDay.findMany({ where: { date: new Date(Date.UTC(istParts(new Date(now.getTime() - DAY_MS)).y, istParts(new Date(now.getTime() - DAY_MS)).m, istParts(new Date(now.getTime() - DAY_MS)).d)), hours: { not: null }, autoLogout: false }, include: { user: true }, orderBy: { lastLogoutAt: "desc" } }).then((rows) => rows.filter((d) => !team || team.includes(d.userId)));

  const brandGrid = [...stats].filter((b) => b.status === "active").sort((a, b) => b.open - a.open || b.lastAt - a.lastAt).slice(0, 8);
  const flowCounts = await Promise.all(sts.map((s) => db.task.count({ where: t(s.isDone ? { statusId: s.id, completedAt: { gte: monthStart } } : { statusId: s.id }) })));
  const nudges = outboxToday.filter((e) => /nudge|late/.test(e.event)).length;
  const qa = lastQa?.after as { question?: string; answer?: string } | null;
  const tasksBrewing = openCount;

  return (
    <section className="view on">
      <section className="hero">
        <div>
          <div className="eyebrow">The morning pour</div>
          <h1 className="serif" style={{ marginTop: 10 }}>{greeting(now)}, <em>{u.firstName}.</em><br />
            {late.length ? `${WORDS[Math.min(late.length, 10)]} need${late.length === 1 ? "s" : ""} you before lunch.` : "Nothing is running late."}</h1>
          <p><b>{tasksBrewing} tasks</b> are brewing across <b>{openBrands.length} brands</b> today.
            {nudges ? <> Sarthi has queued {nudges} nudge{nudges === 1 ? "" : "s"} and {digestBrands} client digests go out at 9:00.</> : <> {digestBrands} client digests go out with Sarthi at 9:00.</>}
            {concerns ? <> <Link href="/admin/concerns" style={{ color: "var(--brand-ink)", fontWeight: 600 }}>{concerns === 1 ? "One concern" : `${WORDS[Math.min(concerns, 10)].replace(" things", "").replace(" thing", "")} concerns`}</Link> from the team {concerns === 1 ? "is" : "are"} waiting on a reply.</> : null}
          </p>
        </div>
        <div className="pour">
          <Link href="/admin/tasks?f=Overdue" className={`tile${late.length ? " hot" : ""}`}><div className={`v num${late.length ? " hot" : ""}`}>{late.length}</div><div className="l">Overdue</div><div className="d">{oldestLate ? `oldest ${oldestLate[0]} ${oldestLate[1]}` : "all on time"}</div></Link>
          <Link href="/admin/tasks?f=Due+today" className="tile"><div className="v num">{dueToday.length}</div><div className="l">Due today</div><div className="d">{before2} before 2 pm</div></Link>
          <Link href="/admin/tasks?f=Awaiting+client" className="tile"><div className="v num">{gate}</div><div className="l">Awaiting client</div><div className="d">approvals pending</div></Link>
          <Link href="/admin/requests" className="tile"><div className="v num">{newReqs.length}</div><div className="l">New requests</div><div className="d">from {new Set(newReqs.map((r) => r.brandId)).size} brand{new Set(newReqs.map((r) => r.brandId)).size === 1 ? "" : "s"}</div></Link>
          {ga ? null : <Link href="/admin/money" className="tile"><div className="v num">{lakh(outstandingSum)}</div><div className="l">Outstanding</div><div className="d">{lakh(overdueSum)} overdue</div></Link>}
        </div>
      </section>

      <div className="row r-3-2">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">01 — Needs you</div><h2>Running <em>late.</em></h2></div><Link className="link" href="/admin/tasks">All {openCount} open tasks →</Link></div>
          <div className="list">
            {late.length ? late.slice(0, 5).map((t) => {
              const [n, unit] = latenessParts(t.deadlineAt, now);
              const a = t.assignees[0]?.user;
              const rej = t.status.isRejected ? t.history[0] : null;
              return (
                <Link key={t.id} href={`/admin/tasks?task=${t.id}`} className="item">
                  <div className="late num">{n}<small>{unit}</small></div>
                  <div className="t">{t.name}<span><b>{t.brand.name}</b> · {a ? <span className="who"><i>{a.firstName[0]}{a.lastName[0] ?? ""}</i>{name(a)}</span> : null} · {rej?.note ? <>rejected by {rej.by?.firstName} — “{rej.note}”</> : <>CS {t.cs.firstName}</>}</span></div>
                  <div className="r"><Pill cls={toneClass(t.status.tone)}>{t.status.name}</Pill><time>due {fmtDue(t.deadlineAt, now)}</time></div>
                </Link>
              );
            }) : <div className="empty">Nothing late. Steady pour.</div>}
          </div>
        </section>

        <section className="card sarthi">
          <div className="card-h"><div><div className="eyebrow">02 — Sarthi</div><h2>Your <em>barista</em> on duty.</h2></div>
            <span className="wa"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20z" /></svg>WhatsApp Business</span></div>
          <div className="chat">
            {qa?.question ? <>
              <div className="bubble q"><small>{lastQa?.actorUserId === u.id ? u.firstName : "Team"} · {fmtTime(lastQa!.at)}</small>{qa.question}</div>
              <div className="bubble a"><small>Sarthi · {fmtTime(lastQa!.at)}</small>{qa.answer}</div>
            </> : <div className="bubble a"><small>Sarthi</small>Ask me anything about a brand, task, person or invoice — the box at the top works on every page.</div>}
          </div>
          <div className="sstats">
            <div><b className="num">{nudges}</b><span>nudges today</span></div>
            <div><b className="num">{digestBrands}</b><span>client digests at 9:00</span></div>
            <div><b className="num">{answersToday}</b><span>questions answered</span></div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><div><div className="eyebrow">03 — Brand health</div><h2>Who&apos;s <em>warm,</em> who&apos;s cooling.</h2></div><Link className="link" href="/admin/brands">All {stats.filter((b) => b.status === "active").length} brands →</Link></div>
        <div className="brands">
          {brandGrid.map((b) => (
            <Link key={b.id} href={`/admin/brands?b=${b.id}`} className="bcard">
              <div><h3>{b.name}</h3><div className="cs">CS {b.cs[0]?.name.split(" ")[0] ?? "—"} · {b.type}</div></div>
              <Ring v={b.health} />
              <div className="meta"><span><b>{b.open}</b> open</span>{b.late ? <span className="warn">{b.late} overdue</span> : b.rejected ? <span className="warn">1 rejected</span> : <span><b>{b.waiting}</b> awaiting client</span>}<span className={b.invHot ? "warn" : ""}>{b.inv}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <div className="row r-3-2">
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">04 — Team on the boil</div><h2>Performance, <em>this month.</em></h2></div><Link className="link" href="/admin/team">Scoring rules →</Link></div>
          <div className="team">
            {scores.map((s, i) => {
              const bd = s.breakdown as { key: string; raw: string; value: number }[];
              const done = bd.find((b) => b.key === "throughput")?.raw.split(" ")[0] ?? "0";
              const ontime = bd.find((b) => b.key === "on_time")?.value ?? 0;
              return (
                <Link href={`/admin/team?p=${s.userId}`} key={s.id} className="member">
                  <span className="rank">{i + 1}</span>
                  <div className="n">{name(s.user)}{s.user.flagsReceived.map((f) => <Flag key={f.id} c={FLAG_CLASS[f.type.colour]} />)}<span>{s.user.designation} · {done} tasks · {ontime}% on time</span></div>
                  <div className="bar"><i style={{ width: `${s.score}%` }} /></div>
                  <b className="s num">{s.score}</b>
                </Link>
              );
            })}
            {!scores.length ? <div className="empty">Scores appear after the first nightly run.</div> : null}
          </div>
        </section>

        <section className="card">
          <div className="card-h"><div><div className="eyebrow">05 — On the floor</div><h2>Attendance, <em>IST.</em></h2></div><Link className="link" href="/admin/attendance">Full log →</Link></div>
          <div className="att">
            {!workingToday || holiday ? (
              <div className="big"><b className="num">—</b><span>{holiday ? `${holiday.subject} · studio closed` : "Studio closed today"}</span></div>
            ) : <div className="big"><b className="num">{firstIn.size}</b><span>of {staff.length} in · first login → last logout</span></div>}
            <table><tbody>
              {attRows.map((p) => {
                const t = firstIn.get(p.id);
                return <tr key={p.id}><td>{name(p)}</td><td className="num">{t ? fmtTime(t) : "—"}</td>
                  <td>{t ? (isLate(t) ? <Pill cls="dim">late</Pill> : <Pill cls="gold">on floor</Pill>) : onLeave.has(p.id) ? <Pill cls="dim">on leave</Pill> : workingToday && !holiday ? <Pill cls="brand">not in</Pill> : <Pill cls="dim">off</Pill>}</td></tr>;
              })}
            </tbody></table>
            {yest[0] ? <div className="legend"><span>Last day: last out {name(yest[0].user)}, {yest[0].lastLogoutAt ? fmtTime(yest[0].lastLogoutAt) : "—"} · avg day {(() => { const h = yest.reduce((s, d) => s + Number(d.hours ?? 0), 0) / yest.length; return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`; })()}</span></div> : null}
          </div>
        </section>
      </div>

      <div className={ga ? "row" : "row r-2-3"}>
        <section className="card">
          <div className="card-h"><div><div className="eyebrow">06 — From clients</div><h2>Work <em>requests.</em></h2></div><Link className="link" href="/admin/requests">Inbox →</Link></div>
          <div className="list req">
            {reqs.map((r) => (
              <Link key={r.id} href={`/admin/requests?r=${r.id}`} className="item">
                <div className="t"><em>“{r.subject}”</em><span><b>{r.brand.name}</b> · {fmtWhen(r.date, now)}{r.attachments.length || r.referenceLink ? " · brief attached" : ""}{r.status !== "new" && r.owner ? ` · ${REQUEST_LABEL[r.status].toLowerCase()} by ${r.owner.firstName}` : ""}</span></div>
                <div className="r"><Pill cls={REQUEST_CLASS[r.status]}>{REQUEST_LABEL[r.status]}</Pill></div>
              </Link>
            ))}
          </div>
        </section>

        {ga ? null : <section className="card">
          <div className="card-h"><div><div className="eyebrow">07 — Invoices & payments</div><h2>{monthName(now, true)}, <em>collected.</em></h2></div><Link className="link" href="/admin/money?new=1">Raise invoice →</Link></div>
          <div className="money">
            <div className="big"><b className="num">{lakh(collected)}</b><span>of {lakh(billed)} billed · {pct(collected)}%</span></div>
            <div className="stack"><i className="paid" style={{ width: `${pct(collected)}%` }} /><i className="due" style={{ width: `${pct(monthDue)}%` }} /><i className="over" style={{ width: `${Math.max(0, 100 - pct(collected) - pct(monthDue))}%` }} /></div>
            <div className="legend">
              <span><i className="flag" style={{ clipPath: "none", borderRadius: 2, background: "var(--gold)", margin: 0 }} /> paid {lakh(collected)}</span>
              <span><i className="flag" style={{ clipPath: "none", borderRadius: 2, background: "var(--fg-2)", opacity: 0.5, margin: 0 }} /> due {lakh(monthDue)}</span>
              <span><i className="flag" style={{ clipPath: "none", borderRadius: 2, background: "var(--brand-ink)", margin: 0 }} /> overdue {lakh(overdueSum)}</span>
            </div>
            <div className="list inv">
              {invoices.filter((i) => i.status !== "draft").sort((a, b) => (b.events[0]?.at.getTime() ?? 0) - (a.events[0]?.at.getTime() ?? 0)).slice(0, 4).map((i) => {
                const rem = i.events.filter((e) => e.kind === "reminder").length;
                const sub = i.status === "paid" ? `Paid via Razorpay · ${i.paidAt ? fmtDate(i.paidAt) : ""}` : i.status === "overdue" ? `Terms: ${i.brand.paymentTerms ?? "—"}${rem ? ` · reminder sent ${rem}×` : ""}` : i.status === "viewed" ? `Viewed ${i.viewedAt ? fmtDate(i.viewedAt) : ""}` : `Due ${fmtDate(i.dueDate)} · GST ${Number(i.gstRate)}%`;
                const od = i.status === "overdue" && i.dueDate ? Math.round((now.getTime() - i.dueDate.getTime()) / DAY_MS) : 0;
                return (
                  <Link key={i.id} href={`/admin/money?inv=${i.id}`} className="item">
                    <span className="id">INV-{i.number}</span>
                    <div className="t">{i.brand.name}<span>{sub}</span></div>
                    <div className="r"><span className="amt num">{inr(i.totalPaise)}</span><Pill cls={INVOICE_CLASS[i.status]}>{i.status === "overdue" ? `Overdue ${od}d` : INVOICE_LABEL[i.status]}</Pill></div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>}
      </div>

      <section className="card">
        <div className="card-h"><div><div className="eyebrow">08 — The flow</div><h2>Where every task <em>sits</em> right now.</h2></div><Link className="link" href="/admin/tasks">Board view →</Link></div>
        <div className="pipe" style={{ gridTemplateColumns: `repeat(${sts.length},minmax(0,1fr))` }}>
          {sts.map((s, i) => (
            <Link key={s.id} href="/admin/tasks" className={`stage${s.isRejected ? " hot" : s.isDone ? " done" : ""}`}><b className="num">{flowCounts[i]}</b><span>{s.name}{s.isDone ? ` · ${monthName(now)}` : ""}</span></Link>
          ))}
        </div>
      </section>
    </section>
  );
}

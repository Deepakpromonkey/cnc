"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ActionButton, useUi } from "../kit";
import { PageHead, Pill } from "../ui";
import { askSarthi } from "@/app/actions/common";
import { setAutomation } from "@/app/actions/settings";

type Msg = { kind: "q" | "a"; who: string; text: string };

export function SarthiView({ me, chat, autos, log, connected, api, queries }: {
  me: string; chat: Msg[]; autos: { k: string; label: string; sub: string; on: boolean }[]; log: { at: string; text: string; delivered: boolean; attempts: number }[];
  connected: boolean; api: boolean; queries: string[];
}) {
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<Msg[]>([]);
  const [pending, start] = useTransition();
  const { toast } = useUi();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [chat, local]);
  useEffect(() => { setLocal([]); }, [chat]);
  return (
    <section className="view on">
      <PageHead eyebrow="Sarthi" title={<>Your <em>barista</em> on duty.</>} sub={`Reads the same database you do. Answers on WhatsApp, nudges the team, keeps clients in the loop so nobody has to ask "status?"`}
        actions={<><Pill cls={connected ? "gold" : "dim"}>{connected ? "Events → Sarthi live" : "Sarthi webhook not set"}</Pill><Pill cls={api ? "gold" : "dim"}>{api ? "Ask API live" : "Answers read from the CRM"}</Pill></>} />
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <section className="card sarthi">
          <div className="card-h"><div><div className="eyebrow">Conversation · this week</div><h2>Today&apos;s <em>questions.</em></h2></div></div>
          <div className="chatbig chat" ref={box}>
            {[...chat, ...local].length ? [...chat, ...local].map((m, i) => <div key={i} className={`bubble ${m.kind}`}><small>{m.who}</small>{m.text}</div>)
              : <div className="bubble a"><small>Sarthi</small>Ask about a brand, task, person or invoice. “Kisan ka packaging kahan tak pahuncha?” works.</div>}
          </div>
          <form className="ask" onSubmit={(e) => {
            e.preventDefault();
            const question = q.trim();
            if (!question || pending) return;
            setLocal((l) => [...l, { kind: "q", who: `${me} · now`, text: question }]);
            setQ("");
            start(async () => {
              const r = await askSarthi(question);
              if (!r.ok) { toast(r.error); return; }
              setLocal((l) => [...l, { kind: "a", who: "Sarthi · now", text: r.answer }]);
              router.refresh();
            });
          }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about a brand, task, person or invoice" />
            <button type="submit" disabled={pending}>{pending ? "…" : "Ask"}</button>
          </form>
        </section>
        <div style={{ display: "grid", gap: 22 }}>
          <section className="card"><div className="card-h"><div><div className="eyebrow">Automations</div><h2>What Sarthi <em>does on its own.</em></h2></div></div>
            <div className="auto">{autos.map((a) => (
              <ActionButton key={a.k} action={setAutomation} values={{ key: a.k, value: a.on ? "off" : "on" }} className={`sw${a.on ? " on" : ""}`} style={{ background: "none", border: 0, padding: "12px 0", textAlign: "left", font: "inherit", color: "inherit", width: "100%", borderTop: "1px solid var(--line)" }}>
                <i /><div><span>{a.label}</span><small>{a.sub}</small></div>
              </ActionButton>
            ))}</div></section>
          <section className="card"><div className="card-h"><div><div className="eyebrow">Today&apos;s log</div><h2>{log.length} event{log.length === 1 ? "" : "s"}, <em>zero nagging.</em></h2></div></div>
            <div className="log">{log.length ? log.map((l, i) => <div key={i}><time>{l.at}</time><span>{l.text}{connected ? (l.delivered ? "" : l.attempts ? ` · retrying (${l.attempts})` : " · queued") : ""}</span></div>)
              : <div><time>—</time><span>Nothing yet today.</span></div>}</div></section>
          <section className="card"><div className="card-h"><div><div className="eyebrow">Agent read access</div><h2>Allowed <em>queries.</em></h2></div></div>
            <div className="tags">{queries.map((x) => <span className="tag" key={x}>{x}</span>)}</div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Read-only Postgres role <b>sarthi_ro</b> on v_* views. Concerns and internal comments are excluded. Every agent query is audit-logged.</p></section>
        </div>
      </div>
    </section>
  );
}

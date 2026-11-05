"use client";
import { useActionState, useState } from "react";
import { mockPay } from "@/app/actions/client";

export function MockPayForm({ id, method, amount }: { id: string; method: string; amount: string }) {
  const [state, action, pending] = useActionState(mockPay, {});
  const [m, setM] = useState(["upi", "card", "netbanking"].includes(method) ? method : "upi");
  return (
    <form className="paybox" action={action}>
      <input type="hidden" name="id" value={id} />
      {[["upi", "UPI", "success@razorpay"], ["card", "Card", "4111 1111 1111 1111 (test)"], ["netbanking", "Netbanking", "Test bank"]].map(([k, l, s]) => (
        <label key={k} className={`payopt${m === k ? " on" : ""}`}>
          <input type="radio" name="method" value={k} checked={m === k} onChange={() => setM(k)} />
          <div><b>{l}</b><small>{s}</small></div><span className="tag">test</span>
        </label>
      ))}
      {state.error ? <p className="err" style={{ margin: 0 }}>{state.error}</p> : null}
      <button className="btn primary block" disabled={pending}>{pending ? "Paying…" : `Pay ${amount}`}</button>
      <a className="linkbtn" style={{ justifySelf: "center" }} href="/client/money">Cancel</a>
    </form>
  );
}

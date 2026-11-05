"use client";
import { useActionState, useState } from "react";
import { requestReset, signIn } from "@/app/actions/common";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "reset">("in");
  const [state, action, pending] = useActionState(signIn, {});
  const [rs, resetAction, resetPending] = useActionState(requestReset, {});

  if (mode === "reset") {
    return (
      <form className="form" action={resetAction}>
        <div className="field">Email or login ID<input name="login" autoComplete="username" required /></div>
        {rs.done ? <p className="ok" style={{ margin: 0 }}>If that account exists, a link is on its way. It works for 30 minutes.</p> : null}
        {rs.error ? <p className="err" style={{ margin: 0 }}>{rs.error}</p> : null}
        <button className="btn primary block" disabled={resetPending}>{resetPending ? "Sending…" : "Email me a reset link"}</button>
        <button type="button" className="linkbtn" onClick={() => setMode("in")}>← Back to sign in</button>
      </form>
    );
  }
  return (
    <form className="form" action={action}>
      <div className="field">Email or login ID<input name="login" autoComplete="username" required autoFocus /></div>
      <div className="field">Password<input name="password" type="password" autoComplete="current-password" required /></div>
      {state.error ? <p className="err" style={{ margin: 0 }}>{state.error}</p> : null}
      <button className="btn primary block" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <button type="button" className="linkbtn" onClick={() => setMode("reset")}>Forgot password, or first time here?</button>
    </form>
  );
}

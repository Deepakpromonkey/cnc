"use client";
import { useActionState } from "react";
import { resetPassword } from "@/app/actions/common";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  return (
    <form className="form" action={action}>
      <input type="hidden" name="token" value={token} />
      <div className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
      <div className="field">Repeat it<input name="repeat" type="password" autoComplete="new-password" minLength={10} required /></div>
      {state.error ? <p className="err" style={{ margin: 0 }}>{state.error}</p> : null}
      <button className="btn primary block" disabled={pending}>{pending ? "Saving…" : "Set password & sign in"}</button>
    </form>
  );
}

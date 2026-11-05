import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  return (
    <div className="login-wrap">
      <div id="backdrop" style={{ backgroundImage: "var(--glow)" }} />
      <div className="login">
        <div className="logo" style={{ paddingRight: 0 }}>
          <img className="red" src="/brand/logo-red.webp" alt="Coffee & Creative" />
          <img className="cream" src="/brand/logo-cream.webp" alt="Coffee & Creative" />
        </div>
        <section className="card">
          <div>
            <div className="eyebrow">One door for the whole studio</div>
            <h1 style={{ marginTop: 8 }}>Pull up a <em>chair.</em></h1>
            <p className="muted" style={{ margin: "8px 0 0" }}>Team, client servicing and clients sign in here. You land in your own portal.</p>
          </div>
          <LoginForm />
        </section>
        <p className="faint small" style={{ textAlign: "center", margin: 0 }}>Coffee & Creative · lets brew thoughts · Built by ProMonkey</p>
      </div>
    </div>
  );
}

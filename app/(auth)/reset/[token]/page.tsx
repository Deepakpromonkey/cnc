import { ResetForm } from "./form";

export const metadata = { title: "Set password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
            <div className="eyebrow">Password</div>
            <h1 style={{ marginTop: 8 }}>A new <em>key.</em></h1>
            <p className="muted" style={{ margin: "8px 0 0" }}>At least 10 characters. Nobody at C&C can see it.</p>
          </div>
          <ResetForm token={token} />
        </section>
      </div>
    </div>
  );
}

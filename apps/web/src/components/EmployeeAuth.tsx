import { useState } from "react";
import { ApiError, employeeLogin, type EmployeeProfile } from "../api.js";
import { BrandHero } from "./Brand.js";

/**
 * Employee sign-in. Accounts are created by an admin (no self-service signup).
 * Username is the work email; the first password is the Jibble kiosk PIN.
 */
export function EmployeeAuth({ onAuthed }: { onAuthed: (p: EmployeeProfile) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onAuthed(await employeeLogin(email.trim(), password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <BrandHero subtitle="Timeclock Corrections" />
      <h1>Sign in</h1>
      <p className="muted">
        Use your Jibble email and kiosk PIN to sign in. Ask Jack if you have any questions.
      </p>
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Jibble email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </label>
        <label className="field">
          <span className="field-label">Kiosk PIN</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error-banner">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

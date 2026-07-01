import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  adminCreateEmployee,
  adminListEmployees,
  adminListJibblePeople,
  type EmployeeAccount,
  type JibblePersonSummary,
} from "../api.js";

/**
 * Admin-only employee account management. Pick a Jibble person and create a
 * login: username = their email, password = their Jibble kiosk PIN. Employees
 * can't self-register or change passwords — this is just a "use your own
 * account" gate.
 */
export function AdminUsers() {
  const [people, setPeople] = useState<JibblePersonSummary[] | null>(null);
  const [accounts, setAccounts] = useState<EmployeeAccount[] | null>(null);
  const [selected, setSelected] = useState("");
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ account: EmployeeAccount; tempPassword: string } | null>(null);

  const load = useCallback(() => {
    adminListJibblePeople()
      .then(setPeople)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load people"));
    adminListEmployees()
      .then(setAccounts)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load accounts"));
  }, []);

  useEffect(load, [load]);

  // Only offer people who don't already have an account.
  const available = useMemo(() => {
    const taken = new Set((accounts ?? []).map((a) => a.email.toLowerCase()));
    return (people ?? []).filter((p) => !taken.has(p.email.toLowerCase()));
  }, [people, accounts]);

  async function create() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminCreateEmployee(selected, override.trim() || undefined);
      setCreated(res);
      setSelected("");
      setOverride("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h1>Employee accounts</h1>
      <p className="muted">
        Create a login for a Jibble employee. Username is their email; the password is their
        Jibble kiosk PIN. They can then sign in to see their timesheet and request corrections.
      </p>

      {created && (
        <div className="record">
          <h3>Account created ✅</h3>
          <p>
            <strong>{created.account.fullName}</strong> — {created.account.email}
          </p>
          <p>
            Password (kiosk PIN): <code>{created.tempPassword}</code>
          </p>
          <p className="muted">Login details were sent to the employee (email/SMS placeholder).</p>
        </div>
      )}

      <label className="field">
        <span className="field-label">Jibble employee</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select an employee…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} ({p.email}){p.pinCode ? "" : " — no kiosk PIN"}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Password override (optional — defaults to kiosk PIN)</span>
        <input
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          placeholder="Leave blank to use the kiosk PIN"
        />
      </label>

      {error && <p className="error-banner">{error}</p>}
      <button className="btn-primary" disabled={busy || !selected} onClick={create}>
        {busy ? "Creating…" : "Create account & send login"}
      </button>

      <h3 style={{ marginTop: "1.75rem" }}>Existing accounts ({accounts?.length ?? 0})</h3>
      {accounts && accounts.length === 0 && <p className="muted">No accounts yet.</p>}
      {accounts && accounts.length > 0 && (
        <ul className="request-list">
          {accounts.map((a) => (
            <li key={a.id} className="request-item">
              <div className="request-main">
                <div className="request-title">{a.fullName}</div>
                <div className="muted">{a.email}</div>
              </div>
              <span className="badge badge-approved">active</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

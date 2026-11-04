import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  adminBulkCreateEmployees,
  adminCreateEmployee,
  adminCreateManual,
  adminListEmployees,
  adminListJibblePeople,
  updatePerson,
  type EmployeeAccount,
  type JibblePersonSummary,
} from "../api.js";

/**
 * Master-admin: manually add a person ahead of their first sign-in. Accounts are
 * normally auto-created when someone signs in with Google; this is for seeding
 * the org chart, or granting admin before first login. No passwords — SSO only.
 */
export function AdminUsers() {
  const [people, setPeople] = useState<JibblePersonSummary[] | null>(null);
  const [accounts, setAccounts] = useState<EmployeeAccount[] | null>(null);
  const [selected, setSelected] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<EmployeeAccount | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [mEmail, setMEmail] = useState("");
  const [mName, setMName] = useState("");
  const [mAdmin, setMAdmin] = useState(false);
  const [mBusy, setMBusy] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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
    return (people ?? []).filter((p) => p.email && !taken.has(p.email.toLowerCase()));
  }, [people, accounts]);

  async function bulkCreate() {
    setBulkBusy(true);
    setError(null);
    setBulkMsg(null);
    try {
      const r = await adminBulkCreateEmployees();
      setBulkMsg(
        r.created === 0
          ? "Everyone already has an account."
          : `Created ${r.created} new account${r.created === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already existed` : ""}.`
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk create failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function setActive(email: string, active: boolean) {
    setArchiving(email);
    setError(null);
    try {
      await updatePerson(email, { active });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setArchiving(null);
    }
  }

  async function createManual() {
    if (!mEmail.trim() || !mName.trim()) return;
    setMBusy(true);
    setError(null);
    try {
      const res = await adminCreateManual(mEmail.trim(), mName.trim(), mAdmin);
      setCreated(res.account);
      setMEmail("");
      setMName("");
      setMAdmin(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add person");
    } finally {
      setMBusy(false);
    }
  }

  async function create() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminCreateEmployee(selected, { isAdmin: asAdmin });
      setCreated(res.account);
      setSelected("");
      setAsAdmin(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add person");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h1>Add people</h1>
      <p className="muted">
        People are added automatically the first time they sign in with Google. Use this to add
        someone ahead of time (e.g. to place them in the org chart) or to grant admin before their
        first login.
      </p>

      <div className="bulk-box">
        <div>
          <strong>Create accounts for everyone</strong>
          <div className="muted">Provision an SSO-ready account for every Jibble employee at once.</div>
        </div>
        <button className="btn-primary btn-inline" disabled={bulkBusy} onClick={bulkCreate}>
          {bulkBusy ? "Creating…" : "Auto-create all"}
        </button>
      </div>
      {bulkMsg && <p className="flash">{bulkMsg}</p>}

      {created && (
        <div className="record">
          <h3>Account added ✅</h3>
          <p>
            <strong>{created.fullName}</strong> — {created.email}
            {created.isAdmin ? " · admin" : ""}
          </p>
          <p className="muted">They can now sign in with Google. Set their approver under “Org chart”.</p>
        </div>
      )}

      <label className="field">
        <span className="field-label">Jibble employee</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select an employee…</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} ({p.email})
            </option>
          ))}
        </select>
      </label>

      <label className="org-toggle" style={{ margin: "0.5rem 0 1rem" }}>
        <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
        <span>Grant admin access</span>
      </label>

      {error && <p className="error-banner">{error}</p>}
      <button className="btn-primary" disabled={busy || !selected} onClick={create}>
        {busy ? "Adding…" : "Add person"}
      </button>

      <h3 style={{ marginTop: "1.75rem" }}>Not in Jibble?</h3>
      <p className="muted">Add a manager or office staff member who doesn't clock in — they can still sign in and approve requests.</p>
      <div className="row">
        <label className="field">
          <span className="field-label">Full name</span>
          <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Jane Doe" />
        </label>
        <label className="field">
          <span className="field-label">Email (their Google login)</span>
          <input type="email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder="jane@…" />
        </label>
      </div>
      <label className="org-toggle" style={{ margin: "0.25rem 0 1rem" }}>
        <input type="checkbox" checked={mAdmin} onChange={(e) => setMAdmin(e.target.checked)} />
        <span>Grant admin access</span>
      </label>
      <button className="btn-secondary" disabled={mBusy || !mEmail.trim() || !mName.trim()} onClick={createManual}>
        {mBusy ? "Adding…" : "Add non-Jibble person"}
      </button>

      {(() => {
        const list = accounts ?? [];
        const active = list.filter((a) => a.active);
        const archived = list.filter((a) => !a.active);
        const shown = showArchived ? [...active, ...archived] : active;
        return (
          <>
            <div className="cal-head" style={{ marginTop: "1.75rem" }}>
              <h3 style={{ margin: 0 }}>Accounts ({active.length})</h3>
              {archived.length > 0 && (
                <button className="btn-link" onClick={() => setShowArchived((s) => !s)}>
                  {showArchived ? "Hide" : "Show"} archived ({archived.length})
                </button>
              )}
            </div>
            {list.length === 0 && <p className="muted">No accounts yet.</p>}
            {shown.length > 0 && (
              <ul className="request-list">
                {shown.map((a) => (
                  <li key={a.id} className={`request-item ${a.active ? "" : "acct-archived"}`}>
                    <div className="request-main">
                      <div className="request-title">
                        {a.fullName}
                        {a.isAdmin ? " · admin" : ""}
                        {!a.jibblePersonId ? " · no Jibble" : ""}
                      </div>
                      <div className="muted">{a.email}</div>
                    </div>
                    <button
                      className="btn-link"
                      disabled={archiving === a.email}
                      onClick={() => setActive(a.email, !a.active)}
                    >
                      {archiving === a.email ? "…" : a.active ? "Archive" : "Restore"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
    </section>
  );
}

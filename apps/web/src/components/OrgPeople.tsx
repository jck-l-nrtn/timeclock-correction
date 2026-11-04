import { useEffect, useState } from "react";
import { ApiError, fetchPeople, updatePerson, type EmployeeAccount } from "../api.js";

/**
 * Org chart (master admin only). Each person has one approver (manager) their
 * requests route to, and an admin flag that grants the console.
 */
export function OrgPeople() {
  const [people, setPeople] = useState<EmployeeAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  const load = () =>
    fetchPeople()
      .then(setPeople)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load people"));

  useEffect(() => {
    load();
  }, []);

  async function patch(email: string, patch: { managerEmail?: string | null; isAdmin?: boolean }) {
    setSavingEmail(email);
    setError(null);
    try {
      const updated = await updatePerson(email, patch);
      setPeople((ps) => (ps ? ps.map((p) => (p.email === email ? updated : p)) : ps));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSavingEmail(null);
    }
  }

  return (
    <section className="card">
      <h1>Org chart</h1>
      <p className="muted">
        Set each person's approver (who reviews their requests) and who has admin access. Only the
        master admin can edit this.
      </p>
      {error && <p className="error-banner">{error}</p>}
      {!people && <p className="muted">Loading…</p>}
      {people && people.length === 0 && (
        <p className="muted">No accounts yet — people appear here after they first sign in, or add them under “Add people”.</p>
      )}

      {people && people.length > 0 && (
        <table className="org-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Approver (manager)</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.email} className={savingEmail === p.email ? "org-saving" : ""}>
                <td>
                  <div className="org-name">{p.fullName || p.email}</div>
                  <div className="muted org-email">{p.email}</div>
                </td>
                <td>
                  <select
                    value={p.managerEmail ?? ""}
                    onChange={(e) => patch(p.email, { managerEmail: e.target.value || null })}
                  >
                    <option value="">— Master admin —</option>
                    {people
                      .filter((o) => o.email !== p.email)
                      .map((o) => (
                        <option key={o.email} value={o.email}>
                          {o.fullName || o.email}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="org-admin-cell">
                  <label className="org-toggle">
                    <input
                      type="checkbox"
                      checked={p.isAdmin}
                      onChange={(e) => patch(p.email, { isAdmin: e.target.checked })}
                    />
                    <span>{p.isAdmin ? "Admin" : "Employee"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

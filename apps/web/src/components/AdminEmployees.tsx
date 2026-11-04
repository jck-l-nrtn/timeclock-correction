import { useEffect, useMemo, useState } from "react";
import { ApiError, fetchPeople, type EmployeeAccount, type EmployeeProfile } from "../api.js";
import { TimesheetPage } from "./TimesheetPage.js";
import { TimeOffView } from "./TimeOffView.js";

/** Admin: look up any employee and view their timesheet + PTO (read-only). */
export function AdminEmployees() {
  const [people, setPeople] = useState<EmployeeAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<EmployeeAccount | null>(null);
  const [tab, setTab] = useState<"timesheet" | "timeoff">("timesheet");

  useEffect(() => {
    fetchPeople()
      .then(setPeople)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load people"));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (people ?? []).filter((p) => p.active !== false);
    if (!term) return list;
    return list.filter((p) => (p.fullName + " " + p.email).toLowerCase().includes(term));
  }, [people, q]);

  if (selected) {
    const profile: EmployeeProfile = {
      email: selected.email,
      fullName: selected.fullName,
      jibblePersonId: selected.jibblePersonId,
      isAdmin: selected.isAdmin,
    };
    return (
      <div>
        <div className="admin-section-head">
          <div>
            <button className="back-link" onClick={() => setSelected(null)}>← All employees</button>
            <h1 className="admin-section-title" style={{ marginTop: "0.3rem" }}>{selected.fullName}</h1>
            <p className="muted" style={{ margin: 0 }}>{selected.email}</p>
          </div>
          <div className="seg-control seg-sm" style={{ margin: 0 }}>
            <button className={tab === "timesheet" ? "seg seg-on" : "seg"} onClick={() => setTab("timesheet")}>Timesheet</button>
            <button className={tab === "timeoff" ? "seg seg-on" : "seg"} onClick={() => setTab("timeoff")}>Time off</button>
          </div>
        </div>
        {tab === "timesheet" ? (
          <TimesheetPage profile={profile} adminEmail={selected.email} />
        ) : (
          <TimeOffView profile={profile} adminEmail={selected.email} />
        )}
      </div>
    );
  }

  return (
    <section className="card">
      <h1>Employees</h1>
      <p className="muted">Look up your team's timeclock and PTO. View-only — this is for corrections and requests, not a replacement for Jibble.</p>
      {error && <p className="error-banner">{error}</p>}
      <input
        className="emp-search"
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!people && <p className="muted">Loading…</p>}
      {people && filtered.length === 0 && <p className="muted">No matching employees.</p>}
      {filtered.length > 0 && (
        <ul className="emp-list">
          {filtered.map((p) => (
            <li key={p.email}>
              <button className="emp-row" onClick={() => setSelected(p)}>
                <span className="emp-name">{p.fullName}{p.isAdmin ? " · admin" : ""}</span>
                <span className="muted emp-email">{p.email}</span>
                <span className="emp-go">View →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

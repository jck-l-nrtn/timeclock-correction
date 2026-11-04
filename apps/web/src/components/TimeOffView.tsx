import type { EmployeeProfile } from "../api.js";
import { PtoForm } from "./PtoForm.js";

export function TimeOffView({ profile }: { profile: EmployeeProfile }) {
  return (
    <div>
      <section className="card">
        <h1>Time Off</h1>
        <p className="muted">Your paid time off at a glance.</p>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-num">—</div>
            <div className="stat-label">Available PTO</div>
          </div>
          <div className="stat">
            <div className="stat-num">—</div>
            <div className="stat-label">Used this year</div>
          </div>
        </div>

        <p className="notice">Your PTO balance loads from Jibble once the connection is refreshed.</p>
      </section>

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <h1>Request time off</h1>
        <p className="muted">Submit a request — your manager will review and approve it.</p>
        <PtoForm
          employeeName={profile.fullName}
          employeeEmail={profile.email}
          jibblePersonId={profile.jibblePersonId}
        />
      </section>
    </div>
  );
}

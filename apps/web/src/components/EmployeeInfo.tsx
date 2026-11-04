import type { EmployeeProfile } from "../api.js";

export function EmployeeInfo({ profile }: { profile: EmployeeProfile }) {
  return (
    <section className="card">
      <h1>My Info</h1>
      <p className="muted">Your employee details on file.</p>
      <dl className="info-grid">
        <div className="info-item">
          <dt>Name</dt>
          <dd>{profile.fullName}</dd>
        </div>
        <div className="info-item">
          <dt>Work email</dt>
          <dd>{profile.email}</dd>
        </div>
        <div className="info-item">
          <dt>Position</dt>
          <dd className="muted">—</dd>
        </div>
        <div className="info-item">
          <dt>Phone</dt>
          <dd className="muted">—</dd>
        </div>
      </dl>
      <p className="notice" style={{ marginTop: "1.25rem" }}>
        Position, phone, and start date fill in automatically from Jibble once the connection is refreshed.
      </p>
    </section>
  );
}

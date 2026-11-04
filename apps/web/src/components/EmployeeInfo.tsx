import { useEffect, useState } from "react";
import type { EmployeeProfile, ProfileDetailsDTO } from "../api.js";
import { fetchMyProfile } from "../api.js";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export function EmployeeInfo({ profile }: { profile: EmployeeProfile }) {
  const [details, setDetails] = useState<ProfileDetailsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMyProfile()
      .then((d) => active && setDetails(d))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const name = details?.fullName || profile.fullName;
  const email = details?.email || profile.email;
  const val = (v: string | null | undefined) =>
    v ? <dd>{v}</dd> : <dd className="muted">{loading ? "…" : "—"}</dd>;

  return (
    <section className="card">
      <h1>My Info</h1>
      <p className="muted">Your employee details on file.</p>
      <dl className="info-grid">
        <div className="info-item">
          <dt>Name</dt>
          <dd>{name}</dd>
        </div>
        <div className="info-item">
          <dt>Work email</dt>
          <dd>{email}</dd>
        </div>
        <div className="info-item">
          <dt>Phone</dt>
          {val(details?.phoneNumber)}
        </div>
        <div className="info-item">
          <dt>Role</dt>
          {val(details?.role)}
        </div>
        <div className="info-item">
          <dt>Status</dt>
          {val(details?.status)}
        </div>
        <div className="info-item">
          <dt>Start date</dt>
          {details?.startDate ? <dd>{fmtDate(details.startDate)}</dd> : val(null)}
        </div>
      </dl>
      {error && (
        <p className="notice" style={{ marginTop: "1.25rem" }}>
          We couldn't reach Jibble for your full details right now. Your name and email are shown
          from your account.
        </p>
      )}
    </section>
  );
}

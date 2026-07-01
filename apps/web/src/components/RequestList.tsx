import { useEffect, useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import { ApiError, fetchMyRequests } from "../api.js";
import { RequestCard } from "./RequestCard.js";

/** The employee's correction requests (session, or a magic-link token). */
export function RequestList({ token }: { token?: string }) {
  const [requests, setRequests] = useState<CorrectionRequestDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyRequests(token)
      .then((r) => active && setRequests(r))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : "Failed to load requests."));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section className="card">
      <h1>My requests</h1>
      {error && <p className="error-banner">{error}</p>}
      {!requests && !error && <p className="muted">Loading…</p>}
      {requests && requests.length === 0 && <p className="muted">You have no correction requests yet.</p>}
      {requests && requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              token={token}
              onUpdated={(updated) =>
                setRequests((list) => (list ? list.map((x) => (x.id === updated.id ? updated : x)) : list))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

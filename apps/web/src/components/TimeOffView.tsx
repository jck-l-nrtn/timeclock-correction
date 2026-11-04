import { useEffect, useState } from "react";
import type { EmployeeProfile, PtoBalanceDTO } from "../api.js";
import { fetchMyPto } from "../api.js";
import { PtoForm } from "./PtoForm.js";

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
// Jibble policy "kind" is "Hours" or a full-day unit ("FullDay"/"Days").
const unitLabel = (u: string) => (u.toLowerCase().includes("hour") ? "hours" : "days");
// Hide policies with nothing in them (e.g. unassigned-but-listed, "Do Not Use").
const meaningful = (b: { balance: number; entitled: number; taken: number; carryForward: number }) =>
  b.balance !== 0 || b.entitled !== 0 || b.taken !== 0 || b.carryForward !== 0;

export function TimeOffView({ profile }: { profile: EmployeeProfile }) {
  const [balances, setBalances] = useState<PtoBalanceDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMyPto()
      .then((b) => active && setBalances(b.filter(meaningful)))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <section className="card">
        <h1>Time Off</h1>
        <p className="muted">Your time-off balances.</p>

        {loading && <p className="muted">Loading your balances…</p>}

        {!loading && error && (
          <p className="notice">We couldn't load your PTO balance from Jibble right now.</p>
        )}

        {!loading && !error && balances && balances.length === 0 && (
          <p className="notice">No time-off policies are assigned to you yet.</p>
        )}

        {!loading && !error && balances && balances.length > 0 && (
          <div className="pto-grid">
            {balances.map((b) => (
              <div key={b.policyId} className="pto-card">
                <div className="pto-head">
                  <span className="pto-name">{b.policyName}</span>
                  {b.compensation && (
                    <span className={`badge ${b.compensation.toLowerCase() === "paid" ? "b-green" : "b-slate"}`}>
                      {b.compensation}
                    </span>
                  )}
                </div>
                <div className="pto-balance">
                  {num(b.balance)} <span className="pto-unit">{unitLabel(b.unit)} left</span>
                </div>
                <div className="pto-sub muted">
                  {num(b.taken)} taken
                  {b.entitled ? ` · ${num(b.entitled)} entitled` : ""}
                  {b.carryForward ? ` · ${num(b.carryForward)} carried over` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
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

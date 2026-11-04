import { useEffect, useState } from "react";
import type { EmployeeProfile, LeaveHistoryDTO, PtoBalanceDTO } from "../api.js";
import { fetchMyPto, fetchPtoHistory } from "../api.js";
import { PtoForm } from "./PtoForm.js";

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const unitLabel = (u: string) => (u.toLowerCase().includes("hour") ? "hours" : "days");
const unitAbbr = (u: string) => (u.toLowerCase().includes("hour") ? "hrs" : "days");
const meaningful = (b: { balance: number; entitled: number; taken: number; carryForward: number }) =>
  b.balance !== 0 || b.entitled !== 0 || b.taken !== 0 || b.carryForward !== 0;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function TimeOffView({ profile }: { profile: EmployeeProfile }) {
  const [balances, setBalances] = useState<PtoBalanceDTO[] | null>(null);
  const [history, setHistory] = useState<LeaveHistoryDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchMyPto().catch(() => null), fetchPtoHistory().catch(() => null)])
      .then(([b, h]) => {
        if (b) setBalances(b.filter(meaningful));
        else setError(true);
        setHistory(h ?? []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Show only real balance amendments (the "Owed PTO" seed + accruals), hiding
  // policy-assignment/archival noise. Newest first.
  const changes = (history ?? []).filter((h) => h.action === "ManualAmendment");

  return (
    <div>
      <section className="card">
        <h1>Time Off</h1>
        <p className="muted">Your current balances.</p>

        {loading && <p className="muted">Loading…</p>}
        {!loading && error && <p className="notice">We couldn't load your PTO balance from Jibble right now.</p>}
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

      {!loading && changes.length > 0 && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <h1>Balance history</h1>
          <p className="muted">Every change to your time-off balance, with the note attached.</p>
          <ul className="ledger">
            {changes.map((h) => (
              <li key={h.id} className="ledger-row">
                <div className="ledger-main">
                  <div className="ledger-desc">{h.description || h.action || "Balance change"}</div>
                  <div className="muted ledger-meta">
                    {fmtDate(h.timestamp)} · {h.policyName}
                  </div>
                </div>
                {h.change !== 0 && (
                  <span className={`ledger-amt ${h.change > 0 ? "amt-pos" : "amt-neg"}`}>
                    {h.change > 0 ? "+" : "−"}
                    {num(Math.abs(h.change))} {unitAbbr(h.unit)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <h1>Request time off</h1>
        <p className="muted">Submit a request — your manager will review and approve it.</p>
        <PtoForm
          employeeName={profile.fullName}
          employeeEmail={profile.email}
          jibblePersonId={profile.jibblePersonId}
          onSubmitted={load}
        />
      </section>
    </div>
  );
}

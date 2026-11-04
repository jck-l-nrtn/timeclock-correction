import { useEffect, useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import type { EmployeeProfile, LeaveHistoryDTO, PtoBalanceDTO } from "../api.js";
import {
  adminFetchPto,
  adminFetchPtoHistory,
  adminFetchRequests,
  fetchMyPto,
  fetchMyRequests,
  fetchPtoHistory,
} from "../api.js";
import { StatusBadge } from "./StatusBadge.js";
import { summarizeRequest } from "../labels.js";
import { PtoForm } from "./PtoForm.js";

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const unitLabel = (u: string) => (u.toLowerCase().includes("hour") ? "hours" : "days");
const unitAbbr = (u: string) => (u.toLowerCase().includes("hour") ? "hrs" : "days");
const meaningful = (b: { balance: number; entitled: number; taken: number; carryForward: number }) =>
  b.balance !== 0 || b.entitled !== 0 || b.taken !== 0 || b.carryForward !== 0;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function TimeOffView({ profile, adminEmail }: { profile: EmployeeProfile; adminEmail?: string }) {
  const readOnly = Boolean(adminEmail);
  const [balances, setBalances] = useState<PtoBalanceDTO[] | null>(null);
  const [history, setHistory] = useState<LeaveHistoryDTO[] | null>(null);
  const [requests, setRequests] = useState<CorrectionRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    const pto = adminEmail ? adminFetchPto(adminEmail) : fetchMyPto();
    const hist = adminEmail ? adminFetchPtoHistory(adminEmail) : fetchPtoHistory();
    const reqs = adminEmail ? adminFetchRequests(adminEmail) : fetchMyRequests();
    Promise.all([pto.catch(() => null), hist.catch(() => null), reqs.catch(() => [])])
      .then(([b, h, r]) => {
        if (b) setBalances(b.filter(meaningful));
        else setError(true);
        setHistory(h ?? []);
        setRequests((r ?? []).filter((x) => x.kind === "timeoff"));
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [adminEmail]);

  const changes = (history ?? []).filter((h) => h.action === "ManualAmendment");
  const timeOffReqs = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div>
      {/* Request form — up top */}
      {!readOnly && (
        <section className="card">
          <h1>Request time off</h1>
          <p className="muted">Take dates off, or cash out PTO hours. Your manager reviews it.</p>
          <PtoForm
            employeeName={profile.fullName}
            employeeEmail={profile.email}
            jibblePersonId={profile.jibblePersonId}
            onSubmitted={load}
          />
        </section>
      )}

      {/* Balances + history combined */}
      <section className="card" style={{ marginTop: readOnly ? 0 : "1.25rem" }}>
        <h1>Time Off balance</h1>
        {loading && <p className="muted">Loading…</p>}
        {!loading && error && <p className="notice">We couldn't load the PTO balance from Jibble right now.</p>}
        {!loading && !error && balances && balances.length === 0 && (
          <p className="notice">No time-off policies are assigned yet.</p>
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

        {changes.length > 0 && (
          <>
            <h2 className="section-sub">Balance history</h2>
            <ul className="ledger">
              {changes.map((h) => (
                <li key={h.id} className="ledger-row">
                  <div className="ledger-main">
                    <div className="ledger-desc">{h.description || h.action || "Balance change"}</div>
                    <div className="muted ledger-meta">{fmtDate(h.timestamp)} · {h.policyName}</div>
                  </div>
                  {h.change !== 0 && (
                    <span className={`ledger-amt ${h.change > 0 ? "amt-pos" : "amt-neg"}`}>
                      {h.change > 0 ? "+" : "−"}{num(Math.abs(h.change))} {unitAbbr(h.unit)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Time-off request statuses */}
      {!loading && timeOffReqs.length > 0 && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>{readOnly ? "Time-off requests" : "My time-off requests"}</h2>
          <ul className="req-list">
            {timeOffReqs.slice(0, 12).map((r) => (
              <li key={r.id} className="req-row">
                <div className="req-main">
                  <div className="req-summary">{summarizeRequest(r)}</div>
                  {r.decisionNote && <div className="muted req-note">{r.decisionNote}</div>}
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

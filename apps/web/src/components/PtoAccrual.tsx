import { useEffect, useMemo, useState } from "react";
import { payPeriodFor, stepPayPeriod, type PayPeriod } from "@timesheet/shared";
import {
  ApiError,
  applyPtoAccrual,
  fetchPayPeriod,
  previewPtoAccrual,
  type AccrualPreview,
  type AccrualResult,
  type PayPeriodDef,
} from "../api.js";
import { parseYmd, todayYmd } from "../timeUtil.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

const niceRange = (a: string, b: string) =>
  `${parseYmd(a).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${parseYmd(b).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
const n2 = (n: number) => n.toFixed(2);

export function PtoAccrual() {
  const [def, setDef] = useState<PayPeriodDef | null>(null);
  const [offset, setOffset] = useState(-1); // default: last completed period
  const [preview, setPreview] = useState<AccrualPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<AccrualResult[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPayPeriod().then(setDef).catch(() => setError("Couldn't load the pay period."));
  }, []);

  const period: PayPeriod | null = useMemo(() => {
    if (!def) return null;
    return stepPayPeriod(def, payPeriodFor(def, todayYmd()), offset);
  }, [def, offset]);

  // Reset results/preview when the period changes.
  useEffect(() => {
    setPreview(null);
    setResults(null);
    setError(null);
  }, [offset]);

  async function runPreview() {
    if (!period) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      setPreview(await previewPtoAccrual(period.start, period.end));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!period) return;
    setConfirm(false);
    setApplying(true);
    setError(null);
    try {
      const res = await applyPtoAccrual(period.start, period.end);
      setResults(res.results);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  const willAccrue = preview?.items.filter((i) => i.pto > 0) ?? [];

  return (
    <section className="card">
      <h1>Pay-period PTO accrual</h1>
      <p className="muted">
        Accrues PTO for everyone on the hourly policy: their worked hours × the rate, written to
        Jibble with a note in your usual style. Preview first, then apply.
      </p>

      <div className="period-bar" style={{ marginTop: "0.75rem" }}>
        <button className="btn-secondary btn-inline" onClick={() => setOffset((o) => o - 1)}>←</button>
        <div className="period-label">
          <div className="period-range">{period ? niceRange(period.start, period.end) : "…"}</div>
          <div className="muted period-name">{def?.name}{offset === -1 ? " · last completed" : offset === 0 ? " · current (in progress)" : ""}</div>
        </div>
        <button className="btn-secondary btn-inline" onClick={() => setOffset((o) => o + 1)}>→</button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!results && (
        <div className="queue-actions" style={{ marginTop: "0.5rem" }}>
          <button className="btn-secondary" onClick={runPreview} disabled={loading || !period}>
            {loading ? "Calculating…" : "Preview accrual"}
          </button>
          {preview && willAccrue.length > 0 && (
            <button className="btn-primary btn-inline" onClick={() => setConfirm(true)} disabled={applying}>
              {applying ? "Applying…" : `Apply to ${willAccrue.length} ${willAccrue.length === 1 ? "person" : "people"}`}
            </button>
          )}
        </div>
      )}

      {preview && !results && (
        <div className="accrual-table-wrap">
          <table className="accrual-table">
            <thead>
              <tr><th>Employee</th><th>Reg hrs</th><th>× {preview.rate}</th><th>PTO</th></tr>
            </thead>
            <tbody>
              {preview.items.map((i) => (
                <tr key={i.personId} className={i.pto <= 0 ? "accrual-skip" : ""}>
                  <td>{i.name}</td>
                  <td className="num">{n2(i.regHrs)}</td>
                  <td className="num muted">{i.pto > 0 ? "=" : "—"}</td>
                  <td className="num accrual-pto">{i.pto > 0 ? `+${n2(i.pto)}` : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.items.length === 0 && <p className="muted">No employees are assigned to the hourly PTO policy.</p>}
          {preview.items[0] && (
            <p className="muted accrual-sample">Note written to Jibble, e.g.: “{willAccrue[0]?.reason ?? preview.items[0].reason}”</p>
          )}
        </div>
      )}

      {results && (
        <div className="accrual-table-wrap">
          <p className="flash">Applied PTO to {results.filter((r) => r.ok && r.pto > 0).length} employees.</p>
          <table className="accrual-table">
            <thead><tr><th>Employee</th><th>PTO</th><th>Result</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.personId}>
                  <td>{r.name}</td>
                  <td className="num accrual-pto">{r.pto > 0 ? `+${n2(r.pto)}` : "0"}</td>
                  <td>{r.ok ? <span className="badge badge-approved">{r.pto > 0 ? "done" : "skipped"}</span> : <span className="badge badge-failed" title={r.error}>failed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-secondary btn-inline" style={{ marginTop: "0.75rem" }} onClick={() => { setResults(null); setPreview(null); }}>
            Done
          </button>
        </div>
      )}

      {confirm && period && (
        <ConfirmDialog
          title="Apply PTO accrual?"
          message={`This writes a PTO amendment to Jibble for ${willAccrue.length} ${willAccrue.length === 1 ? "employee" : "employees"} for ${niceRange(period.start, period.end)}. This changes real balances and can't be auto-undone.`}
          confirmLabel="Apply to Jibble"
          busy={applying}
          onConfirm={apply}
          onCancel={() => setConfirm(false)}
        />
      )}
    </section>
  );
}

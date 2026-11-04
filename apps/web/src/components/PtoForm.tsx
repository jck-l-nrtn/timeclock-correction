import { useState } from "react";
import { CreatePtoRequestSchema, PtoType } from "@timesheet/shared";
import { ApiError, submitPtoRequest } from "../api.js";

export function PtoForm({
  employeeName,
  employeeEmail,
  jibblePersonId,
  initialStart = "",
  initialEnd = "",
  onSubmitted,
}: {
  employeeName: string;
  employeeEmail: string;
  jibblePersonId?: string | null;
  initialStart?: string;
  initialEnd?: string;
  onSubmitted?: () => void;
}) {
  const [ptoType, setPtoType] = useState<string>(PtoType.Vacation);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const payload = {
      employeeName,
      employeeEmail,
      jibblePersonId: jibblePersonId || undefined,
      ptoType,
      startDate,
      endDate: endDate || startDate,
      reason,
    };
    const parsed = CreatePtoRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".")] = i.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await submitPtoRequest(parsed.data);
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      if (err instanceof ApiError && err.issues) {
        const fe: Record<string, string> = {};
        for (const i of err.issues) fe[i.field] = i.message;
        setErrors(fe);
      } else {
        setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="notice" style={{ marginTop: "1rem" }}>
        ✓ Time-off request submitted — your manager will review it. Track it under <strong>My Requests</strong>.
        <div style={{ marginTop: "0.75rem" }}>
          <button className="btn-secondary btn-inline" onClick={() => setDone(false)}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span className="field-label">Type</span>
        <select value={ptoType} onChange={(e) => setPtoType(e.target.value)}>
          <option value="vacation">Vacation</option>
          <option value="sick">Sick</option>
          <option value="unpaid">Unpaid</option>
          <option value="other">Other</option>
        </select>
        {errors.ptoType && <span className="field-error">{errors.ptoType}</span>}
      </label>

      <div className="row">
        <label className="field">
          <span className="field-label">Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          {errors.startDate && <span className="field-error">{errors.startDate}</span>}
        </label>
        <label className="field">
          <span className="field-label">End date</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          {errors.endDate && <span className="field-error">{errors.endDate}</span>}
        </label>
      </div>

      <label className="field">
        <span className="field-label">Reason / notes</span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family vacation" />
        {errors.reason && <span className="field-error">{errors.reason}</span>}
      </label>

      {submitError && <p className="error-banner">{submitError}</p>}
      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}

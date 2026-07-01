import { useState } from "react";
import {
  CreateCorrectionRequestSchema,
  EventType,
  type CorrectionRequestDTO,
} from "@timesheet/shared";
import { ApiError, submitCorrectionRequest } from "../api.js";
import { labelForEvent } from "../labels.js";

export interface CorrectionFormInitial {
  employeeName?: string;
  employeeEmail?: string;
  jibblePersonId?: string;
  /** When set, this request edits an existing Jibble entry (an adjustment). */
  jibbleEntryId?: string;
  date?: string;
  eventType?: EventType;
  intendedTime?: string;
  reason?: string;
}

interface CorrectionFormProps {
  initial?: CorrectionFormInitial;
  /** Make the email read-only (used when the timesheet already knows who you are). */
  lockEmail?: boolean;
  /** Hide name/email inputs entirely — identity comes from the login session. */
  hideIdentity?: boolean;
  heading?: string;
  subheading?: string;
  /** If provided, called on success (parent handles the "done" state). Otherwise
   *  the form shows its own confirmation card. */
  onSubmitted?: (dto: CorrectionRequestDTO) => void;
  onCancel?: () => void;
}

function buildState(initial?: CorrectionFormInitial) {
  return {
    employeeName: initial?.employeeName ?? "",
    employeeEmail: initial?.employeeEmail ?? "",
    jibblePersonId: initial?.jibblePersonId ?? "",
    jibbleEntryId: initial?.jibbleEntryId ?? "",
    date: initial?.date ?? "",
    eventType: initial?.eventType ?? EventType.ClockIn,
    intendedTime: initial?.intendedTime ?? "",
    reason: initial?.reason ?? "",
    affirmed: false,
  };
}
type FormState = ReturnType<typeof buildState>;

export function CorrectionForm({
  initial,
  lockEmail,
  hideIdentity,
  heading = "Report a missed timeclock",
  subheading = "Forgot to clock in or out, or need a time corrected? Fill this out and an admin will review it.",
  onSubmitted,
  onCancel,
}: CorrectionFormProps) {
  const [form, setForm] = useState<FormState>(() => buildState(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CorrectionRequestDTO | null>(null);

  const isEdit = Boolean(form.jibbleEntryId);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const payload = {
      ...form,
      jibblePersonId: form.jibblePersonId.trim() || undefined,
      jibbleEntryId: form.jibbleEntryId.trim() || undefined,
    };
    const parsed = CreateCorrectionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const dto = await submitCorrectionRequest(parsed.data);
      if (onSubmitted) onSubmitted(dto);
      else setResult(dto);
    } catch (err) {
      if (err instanceof ApiError && err.issues) {
        const fieldErrors: Record<string, string> = {};
        for (const i of err.issues) fieldErrors[i.field] = i.message;
        setErrors(fieldErrors);
      } else {
        setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="card">
        <h1>Request submitted ✅</h1>
        <p className="muted">
          Thanks, {result.employeeName}. A timeclock admin will review your request.
        </p>
        <dl className="summary">
          <div>
            <dt>Reference</dt>
            <dd>
              <code>{result.id}</code>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="pill">{result.status}</span>
            </dd>
          </div>
          <div>
            <dt>What</dt>
            <dd>
              {labelForEvent(result.eventType)} on {result.date} at {result.intendedTime}
            </dd>
          </div>
        </dl>
        <button className="btn-secondary" onClick={() => setResult(null)}>
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>{heading}</h1>
      <p className="muted">{subheading}</p>
      {isEdit && (
        <p className="pill">Editing an existing entry — approval will replace it with the corrected time.</p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {!hideIdentity && (
          <>
            <Field label="Your name" error={errors.employeeName}>
              <input
                value={form.employeeName}
                onChange={(e) => update("employeeName", e.target.value)}
                placeholder="Jane Doe"
              />
            </Field>

            <Field label="Work email" error={errors.employeeEmail}>
              <input
                type="email"
                value={form.employeeEmail}
                onChange={(e) => update("employeeEmail", e.target.value)}
                placeholder="jane@company.com"
                readOnly={lockEmail}
              />
            </Field>
          </>
        )}

        <div className="row">
          <Field label="Date" error={errors.date}>
            <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
          </Field>
          <Field label={isEdit ? "Corrected time" : "Intended time"} error={errors.intendedTime}>
            <input
              type="time"
              value={form.intendedTime}
              onChange={(e) => update("intendedTime", e.target.value)}
            />
          </Field>
        </div>

        {!isEdit && (
          <Field label="What happened?" error={errors.eventType}>
            <select
              value={form.eventType}
              onChange={(e) => update("eventType", e.target.value as EventType)}
            >
              <option value={EventType.ClockIn}>Missed clock-IN</option>
              <option value={EventType.ClockOut}>Missed clock-OUT</option>
              <option value={EventType.Adjustment}>Time adjustment</option>
            </select>
          </Field>
        )}

        <Field label="Reason" error={errors.reason}>
          <textarea
            rows={3}
            value={form.reason}
            onChange={(e) => update("reason", e.target.value)}
            placeholder="e.g. Forgot to clock out before leaving the site."
          />
        </Field>

        <label className="affirm">
          <input
            type="checkbox"
            checked={form.affirmed}
            onChange={(e) => update("affirmed", e.target.checked)}
          />
          <span>I affirm that the above information is correct.</span>
        </label>
        {errors.affirmed && <span className="field-error">{errors.affirmed}</span>}

        {submitError && <p className="error-banner">{submitError}</p>}

        <div className="queue-actions">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit request"}
          </button>
          {onCancel && (
            <button type="button" className="btn-secondary btn-inline" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Small labeled form-field wrapper with inline error display. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

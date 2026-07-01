import { useState } from "react";
import { RequestStatus, type CorrectionRequestDTO, type DigitalRecord } from "@timesheet/shared";
import { ApiError, acknowledgeRequest } from "../api.js";
import { StatusBadge } from "./StatusBadge.js";
import { DigitalRecordView } from "./DigitalRecordView.js";
import { labelForEvent } from "../labels.js";

const ACKNOWLEDGEABLE: string[] = [RequestStatus.Approved, RequestStatus.Applied, RequestStatus.Failed];

function parseRecord(json: string | null): DigitalRecord | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DigitalRecord;
  } catch {
    return null;
  }
}

export function RequestCard({
  request,
  token,
  onUpdated,
}: {
  request: CorrectionRequestDTO;
  token?: string;
  onUpdated: (updated: CorrectionRequestDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = parseRecord(request.digitalRecord);
  const canAcknowledge = ACKNOWLEDGEABLE.includes(request.status) && !request.employeeAckSignature;

  async function sign() {
    setError(null);
    setBusy(true);
    try {
      onUpdated(await acknowledgeRequest(request.id, signature, token));
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : "Failed to sign");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="request-item request-card">
      <div className="request-card-head">
        <div className="request-main">
          <div className="request-title">
            {labelForEvent(request.eventType)} · {request.date} at {request.intendedTime}
          </div>
          <div className="muted request-reason">{request.reason}</div>
          {request.decisionNote && <div className="request-note">Admin note: {request.decisionNote}</div>}
        </div>
        <StatusBadge status={request.status} />
      </div>

      {request.employeeAckSignature && (
        <div className="ack-done">
          ✓ Acknowledged by <strong>{request.employeeAckSignature}</strong>
          {request.ackAt ? ` on ${new Date(request.ackAt).toLocaleString()}` : ""}
        </div>
      )}

      {canAcknowledge && (
        <div className="ack-block">
          <button className="btn-link" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide record" : "Review & sign"}
          </button>

          {open && record && (
            <div>
              <DigitalRecordView record={record} />
              <label className="field">
                <span className="field-label">Type your full name to acknowledge</span>
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Your full name"
                />
              </label>
              {error && <p className="error-banner">{error}</p>}
              <button className="btn-primary" disabled={busy || signature.trim().length < 2} onClick={sign}>
                {busy ? "Signing…" : "Acknowledge & sign"}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

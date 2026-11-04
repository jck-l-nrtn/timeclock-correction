import { useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import { StatusBadge } from "./StatusBadge.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { summarizeRequest } from "../labels.js";

export type DecideFn = (
  r: CorrectionRequestDTO,
  d: "approved" | "denied",
  note: string
) => Promise<void>;

/** A single pending request with inline approve/deny + confirm. */
export function QueueItem({ request, onDecide }: { request: CorrectionRequestDTO; onDecide: DecideFn }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<"approved" | "denied" | null>(null);

  async function confirmDecision() {
    if (!pending) return;
    setBusy(true);
    await onDecide(request, pending, note);
    setBusy(false);
    setPending(null);
  }

  const changeLabel = summarizeRequest(request);

  return (
    <li className="request-item queue-item">
      <div className="request-main">
        <div className="request-title">
          {request.employeeName}
          {request.kind === "timeoff" ? " · Time off" : ""}
        </div>
        <div className="muted">
          {changeLabel} · {request.employeeEmail}
        </div>
        <div className="request-reason muted">“{request.reason}”</div>
        {request.kind !== "timeoff" && request.affirmed && (
          <div className="muted request-affirm">✓ Employee affirmed the information is correct</div>
        )}
        <textarea
          rows={2}
          className="note-input"
          placeholder="Note (optional) — shown to the employee"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="queue-actions">
          <button className="btn-primary" disabled={busy} onClick={() => setPending("approved")}>
            Approve
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => setPending("denied")}>
            Deny
          </button>
        </div>
      </div>
      <StatusBadge status={request.status} />

      {pending && (
        <ConfirmDialog
          title={pending === "approved" ? "Approve request?" : "Deny request?"}
          message={
            `${request.employeeName}: ${changeLabel}.` +
            (pending === "approved"
              ? request.kind === "timeoff"
                ? " This approves their time off."
                : " This will apply the correction to Jibble."
              : " The employee will see it was denied.") +
            (note.trim() ? ` Note: “${note.trim()}”.` : "")
          }
          confirmLabel={pending === "approved" ? "Approve" : "Deny"}
          danger={pending === "denied"}
          busy={busy}
          onConfirm={confirmDecision}
          onCancel={() => setPending(null)}
        />
      )}
    </li>
  );
}

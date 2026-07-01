import { useEffect, useState } from "react";
import type { CorrectionRequestDTO, DigitalRecord } from "@timesheet/shared";
import { ApiError, fetchAdminLog } from "../api.js";
import { StatusBadge } from "./StatusBadge.js";
import { DigitalRecordView } from "./DigitalRecordView.js";
import { labelForEvent } from "../labels.js";

function parseRecord(json: string | null): DigitalRecord | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DigitalRecord;
  } catch {
    return null;
  }
}

/** Audit log: every decided request, who decided it, when — with its record. */
export function AdminLog() {
  const [rows, setRows] = useState<CorrectionRequestDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminLog()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load log"));
  }, []);

  return (
    <section className="card">
      <h1>Decision log</h1>
      <p className="muted">Every approved and denied request, with who decided it and when.</p>
      {error && <p className="error-banner">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">No decisions yet.</p>}

      {rows && rows.length > 0 && (
        <ul className="request-list">
          {rows.map((r) => {
            const record = parseRecord(r.digitalRecord);
            const open = openId === r.id;
            return (
              <li key={r.id} className="request-item request-card">
                <div className="request-card-head">
                  <div className="request-main">
                    <div className="request-title">
                      {r.employeeName} · {labelForEvent(r.eventType)} · {r.date} at {r.intendedTime}
                    </div>
                    <div className="muted">
                      {r.decidedBy ? `${r.decidedBy}` : "—"}
                      {r.decidedAt ? ` · ${new Date(r.decidedAt).toLocaleString()}` : ""}
                    </div>
                    {r.decisionNote && <div className="request-note">Note: {r.decisionNote}</div>}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {record && (
                  <div className="ack-block">
                    <button className="btn-link" onClick={() => setOpenId(open ? null : r.id)}>
                      {open ? "Hide record" : "View record"}
                    </button>
                    {open && <DigitalRecordView record={record} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

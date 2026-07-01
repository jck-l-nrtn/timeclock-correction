import type { DigitalRecord } from "@timesheet/shared";
import { labelForEvent } from "../labels.js";

/** Renders the immutable per-entry record shared by the employee + admin views. */
export function DigitalRecordView({ record }: { record: DigitalRecord }) {
  return (
    <div className="record">
      <h3>Record of change</h3>
      <dl className="summary">
        <div>
          <dt>Employee</dt>
          <dd>{record.employeeName}</dd>
        </div>
        <div>
          <dt>Change</dt>
          <dd>
            {record.change.kind === "edit" ? "Edit existing entry" : "New entry"} —{" "}
            {labelForEvent(record.change.eventType)} on {record.change.date} at {record.change.intendedTime}
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{record.reason}</dd>
        </div>
        <div>
          <dt>Employee affirmation</dt>
          <dd>{record.affirmation.affirmed ? "Affirmed the information is correct" : "Not affirmed"}</dd>
        </div>
        <div>
          <dt>Decision</dt>
          <dd>
            {record.decision} by {record.decidedBy}
            {record.decidedAt ? ` on ${new Date(record.decidedAt).toLocaleString()}` : ""}
          </dd>
        </div>
        <div>
          <dt>Jibble</dt>
          <dd>{record.jibbleOutcome}</dd>
        </div>
      </dl>
    </div>
  );
}

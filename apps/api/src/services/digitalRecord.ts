import type { DigitalRecord, EventType } from "@timesheet/shared";
import type { RequestItem } from "../db/data.js";

/**
 * Build the immutable record of a decided request — a snapshot of the change,
 * who decided it, and the Jibble outcome. Stored as JSON on the request.
 */
export function buildDigitalRecord(row: RequestItem, adminName: string): DigitalRecord {
  return {
    requestId: row.id,
    generatedAt: new Date().toISOString(),
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail,
    reason: row.reason,
    change: {
      kind: row.jibbleEntryId ? "edit" : "new",
      date: row.date,
      eventType: row.eventType as EventType,
      intendedTime: row.intendedTime,
      jibbleEntryId: row.jibbleEntryId,
    },
    affirmation: { affirmed: row.affirmed },
    decision: row.status === "denied" ? "denied" : "approved",
    decidedBy: adminName,
    decidedAt: row.decidedAt ?? new Date().toISOString(),
    jibbleOutcome: row.jibbleResult ?? (row.status === "denied" ? "Denied by admin" : "Approved"),
  };
}

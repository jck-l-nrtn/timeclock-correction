import type { CorrectionRequest } from "@prisma/client";
import type { DigitalRecord, EventType } from "@timesheet/shared";

/**
 * Build the immutable record of a decided request — a snapshot of exactly what
 * change was requested, who decided it, and what happened in Jibble. Stored as
 * JSON on the request; the employee acknowledges it with a digital signature.
 */
export function buildDigitalRecord(row: CorrectionRequest, adminName: string): DigitalRecord {
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
    decidedAt: (row.decidedAt ?? new Date()).toISOString(),
    jibbleOutcome: row.jibbleResult ?? (row.status === "denied" ? "Denied by admin" : "Approved"),
  };
}

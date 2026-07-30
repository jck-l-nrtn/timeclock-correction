import type { CorrectionRequestDTO, EventType, RequestStatus } from "@timesheet/shared";
import type { RequestItem } from "./db/data.js";

/** Convert a stored DynamoDB request item into the shared API/DTO shape. */
export function toCorrectionRequestDTO(row: RequestItem): CorrectionRequestDTO {
  return {
    id: row.id,
    employeeName: row.employeeName,
    jibblePersonId: row.jibblePersonId,
    jibbleEntryId: row.jibbleEntryId,
    employeeEmail: row.employeeEmail,
    date: row.date,
    eventType: row.eventType as EventType,
    intendedTime: row.intendedTime,
    reason: row.reason,
    status: row.status as RequestStatus,
    decisionNote: row.decisionNote,
    decidedBy: row.decidedByName,
    decidedAt: row.decidedAt,
    jibbleResult: row.jibbleResult,
    digitalRecord: row.digitalRecord,
    affirmed: row.affirmed,
    employeeAckSignature: row.employeeAckSignature,
    ackAt: row.ackAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

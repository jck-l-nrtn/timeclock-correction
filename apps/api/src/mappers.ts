import type { CorrectionRequest } from "@prisma/client";
import type { CorrectionRequestDTO, EventType, RequestStatus } from "@timesheet/shared";

/** A request row, optionally with the deciding admin relation included. */
type RowWithAdmin = CorrectionRequest & { decidedByAdmin?: { name: string } | null };

/**
 * Convert a Prisma row into the API/DTO shape shared with the frontend.
 * Dates are serialized to ISO strings; enum-ish string columns are surfaced
 * as their shared union types.
 */
export function toCorrectionRequestDTO(row: RowWithAdmin): CorrectionRequestDTO {
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
    decidedBy: row.decidedByAdmin?.name ?? null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    jibbleResult: row.jibbleResult,
    digitalRecord: row.digitalRecord,
    affirmed: row.affirmed,
    employeeAckSignature: row.employeeAckSignature,
    ackAt: row.ackAt ? row.ackAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

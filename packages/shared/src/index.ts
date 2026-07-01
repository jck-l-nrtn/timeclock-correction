import { z } from "zod";

/**
 * Shared domain types + validation schemas used by both the API and the web app.
 * Keeping these in one place means a change to the request shape is enforced on
 * the server (route validation) and typed on the client (forms) simultaneously.
 */

// ---- Enums ----------------------------------------------------------------

export const EventType = {
  ClockIn: "in",
  ClockOut: "out",
  Adjustment: "adjust",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const RequestStatus = {
  Pending: "pending",
  Approved: "approved",
  Denied: "denied",
  Applied: "applied", // approved AND successfully written to Jibble
  Failed: "failed", // approved but the Jibble write failed
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

// ---- Employee submission --------------------------------------------------

/** Payload the employee's report form POSTs to the API. */
export const CreateCorrectionRequestSchema = z.object({
  employeeName: z.string().min(1, "Name is required").max(120),
  /** Jibble person id if known; otherwise resolved server-side from email. */
  jibblePersonId: z.string().max(120).optional(),
  employeeEmail: z.string().email("A valid email is required"),
  /**
   * Jibble time-entry id being changed, when the request targets an existing
   * entry (an edit). Omitted for a brand-new / missed entry.
   */
  jibbleEntryId: z.string().max(120).optional(),
  /** ISO date (YYYY-MM-DD) the missed/adjusted event applies to. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  eventType: z.enum([EventType.ClockIn, EventType.ClockOut, EventType.Adjustment]),
  /** Intended local time of the event, HH:mm (24h). */
  intendedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm"),
  reason: z.string().min(3, "Please give a brief reason").max(1000),
  /** Must be checked: "I affirm the above information is correct." */
  affirmed: z.boolean().refine((v) => v === true, "You must affirm the information is correct"),
});
export type CreateCorrectionRequest = z.infer<typeof CreateCorrectionRequestSchema>;

/** A Jibble time entry as shown in the employee's timesheet view. */
export interface TimesheetEntryDTO {
  id: string;
  /** "In" | "Out" (Jibble's TimeEntryType). */
  type: string;
  /** UTC ISO timestamp of the clock event. */
  timeUtc: string;
  /** Local wall-clock ISO (with offset) as Jibble derived it, if present. */
  localTime: string | null;
  /** The calendar day (YYYY-MM-DD) the entry belongs to. */
  belongsToDate: string;
  note: string | null;
  isManual: boolean;
  /** Locked entries sit in a closed pay period and cannot be changed. */
  isLocked: boolean;
  status: string;
}

/** Response for the employee timesheet lookup. */
export interface TimesheetDTO {
  person: { id: string; fullName: string; email: string };
  from: string;
  to: string;
  entries: TimesheetEntryDTO[];
}

// ---- Admin decision -------------------------------------------------------

export const AdminDecisionSchema = z.object({
  decision: z.enum([RequestStatus.Approved, RequestStatus.Denied]),
  note: z.string().max(1000).optional(),
});
export type AdminDecision = z.infer<typeof AdminDecisionSchema>;

// ---- Employee acknowledgement (digital signature) -------------------------

export const AcknowledgeSchema = z.object({
  /** Magic-link token (optional — a logged-in employee is identified by session). */
  token: z.string().optional(),
  /** Typed full name acting as the digital signature. */
  signature: z.string().min(2, "Please type your full name to sign").max(120),
});
export type Acknowledge = z.infer<typeof AcknowledgeSchema>;

/** Immutable snapshot generated when an admin decides a request. */
export interface DigitalRecord {
  requestId: string;
  generatedAt: string;
  employeeName: string;
  employeeEmail: string;
  reason: string;
  change: {
    kind: "new" | "edit";
    date: string;
    eventType: EventType;
    intendedTime: string;
    jibbleEntryId: string | null;
  };
  /** Employee attestation captured when the request was submitted. */
  affirmation: { affirmed: boolean };
  decision: "approved" | "denied";
  decidedBy: string;
  decidedAt: string;
  jibbleOutcome: string;
}

// ---- API response shape ---------------------------------------------------

export interface CorrectionRequestDTO {
  id: string;
  employeeName: string;
  jibblePersonId: string | null;
  jibbleEntryId: string | null;
  employeeEmail: string;
  date: string;
  eventType: EventType;
  intendedTime: string;
  reason: string;
  status: RequestStatus;
  decisionNote: string | null;
  /** Admin who decided the request (name), and when. */
  decidedBy: string | null;
  decidedAt: string | null;
  jibbleResult: string | null;
  digitalRecord: string | null;
  /** Employee affirmed the request was correct at submission. */
  affirmed: boolean;
  employeeAckSignature: string | null;
  ackAt: string | null;
  createdAt: string;
  updatedAt: string;
}

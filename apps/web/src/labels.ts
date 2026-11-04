import { EventType, RequestStatus, type CorrectionRequestDTO } from "@timesheet/shared";

/** Human label for an event type. */
export function labelForEvent(type: EventType): string {
  if (type === EventType.ClockIn) return "Missed clock-in";
  if (type === EventType.ClockOut) return "Missed clock-out";
  return "Time adjustment";
}

/** Capitalized PTO type label. */
export function ptoTypeLabel(t: string | null): string {
  if (!t) return "Time off";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One-line summary of a request (timeclock correction or PTO). */
export function summarizeRequest(r: CorrectionRequestDTO): string {
  if (r.kind === "timeoff") {
    const range = r.endDate && r.endDate !== r.startDate ? `${r.startDate} – ${r.endDate}` : r.startDate;
    return `${ptoTypeLabel(r.ptoType)} time off · ${range}`;
  }
  return `${labelForEvent(r.eventType)} · ${r.date} at ${r.intendedTime}`;
}

/** Human label + CSS modifier class for a request status badge. */
export function statusMeta(status: RequestStatus): { label: string; className: string } {
  switch (status) {
    case RequestStatus.Pending:
      return { label: "Pending", className: "badge-pending" };
    case RequestStatus.Approved:
      return { label: "Approved", className: "badge-approved" };
    case RequestStatus.Applied:
      return { label: "Applied to Jibble", className: "badge-approved" };
    case RequestStatus.Denied:
      return { label: "Denied", className: "badge-denied" };
    case RequestStatus.Failed:
      return { label: "Approved · Jibble sync failed", className: "badge-failed" };
    default:
      return { label: status, className: "badge-pending" };
  }
}

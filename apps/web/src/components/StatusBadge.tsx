import type { RequestStatus } from "@timesheet/shared";
import { statusMeta } from "../labels.js";

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, className } = statusMeta(status);
  return <span className={`badge ${className}`}>{label}</span>;
}

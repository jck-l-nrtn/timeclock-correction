import type {
  CorrectionRequestDTO,
  CreateCorrectionRequest,
  CreatePtoRequest,
  TimesheetDTO,
  ProfileDetailsDTO,
  PtoBalanceDTO,
  HolidayDTO,
  PayPeriodDef,
} from "@timesheet/shared";

export type { ProfileDetailsDTO, PtoBalanceDTO, HolidayDTO, PayPeriodDef };

/** The org's pay-period definition (from Jibble, cached server-side). */
export async function fetchPayPeriod(): Promise<PayPeriodDef> {
  const res = await fetch("/api/employee/payperiod", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load pay period (${res.status})`, res.status);
  return (await res.json()) as PayPeriodDef;
}

/** Field-level validation errors returned by the API (400). */
export interface ApiValidationError {
  error: "validation_failed";
  issues: { field: string; message: string }[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: { field: string; message: string }[]
  ) {
    super(message);
  }
}

/** Submit a new correction request. Throws ApiError on non-2xx. */
export async function submitCorrectionRequest(
  input: CreateCorrectionRequest
): Promise<CorrectionRequestDTO> {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiValidationError | null;
    throw new ApiError(
      body?.error ?? `Request failed (${res.status})`,
      res.status,
      body?.issues
    );
  }
  return (await res.json()) as CorrectionRequestDTO;
}

/** Submit a time-off (PTO) request. Throws ApiError on non-2xx. */
export async function submitPtoRequest(input: CreatePtoRequest): Promise<CorrectionRequestDTO> {
  const res = await fetch("/api/pto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiValidationError | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.issues);
  }
  return (await res.json()) as CorrectionRequestDTO;
}

// ---- Employee accounts ----------------------------------------------------

export interface EmployeeProfile {
  email: string;
  fullName: string;
  jibblePersonId: string | null;
  /** True if this person also has admin-console access. */
  isAdmin: boolean;
}

export async function employeeMe(): Promise<EmployeeProfile | null> {
  const res = await fetch("/api/employee/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return (await res.json()) as EmployeeProfile;
}

/** Begin Google sign-in (full-page redirect). `intent` picks the landing surface. */
export function startGoogleLogin(intent: "employee" | "admin" = "employee"): void {
  window.location.href = `/api/auth/google/start?intent=${intent}`;
}

export async function employeeLogout(): Promise<void> {
  await fetch("/api/employee/logout", { method: "POST", credentials: "include" });
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

/** Live Jibble profile details (phone, role, status, start date) for My Info. */
export async function fetchMyProfile(): Promise<ProfileDetailsDTO> {
  const res = await fetch("/api/employee/profile", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load profile (${res.status})`, res.status);
  return (await res.json()) as ProfileDetailsDTO;
}

/** The employee's time-off (PTO) policy balances, live from Jibble. */
export async function fetchMyPto(): Promise<PtoBalanceDTO[]> {
  const res = await fetch("/api/employee/pto", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load PTO (${res.status})`, res.status);
  return (await res.json()) as PtoBalanceDTO[];
}

/** The company's upcoming paid holidays, live from Jibble. */
export async function fetchHolidays(): Promise<HolidayDTO[]> {
  const res = await fetch("/api/holidays", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load holidays (${res.status})`, res.status);
  return (await res.json()) as HolidayDTO[];
}

/** Employee digitally signs off on a decided request (uses the session). */
export async function acknowledgeRequest(
  id: string,
  signature: string,
  token?: string
): Promise<CorrectionRequestDTO> {
  const res = await fetch(`/api/requests/${id}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ signature, ...(token ? { token } : {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiValidationError | null;
    throw new ApiError(body?.error ?? `Failed (${res.status})`, res.status, body?.issues);
  }
  return (await res.json()) as CorrectionRequestDTO;
}

/** Fetch the signed-in employee's requests (session, or magic-link token). */
export async function fetchMyRequests(token?: string): Promise<CorrectionRequestDTO[]> {
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`/api/requests${qs}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(
      res.status === 401 ? "Please sign in to view your requests." : `Request failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as CorrectionRequestDTO[];
}

/** Fetch the employee's live Jibble timesheet for a date range (session, or token). */
export async function fetchTimesheet(
  from: string,
  to: string,
  token?: string
): Promise<TimesheetDTO> {
  const qs = new URLSearchParams({ from, to, ...(token ? { token } : {}) });
  const res = await fetch(`/api/timesheet?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const msg =
      res.status === 401
        ? "This link is invalid or has expired."
        : body?.error === "no_jibble_person"
          ? "We couldn't find a Jibble profile for your email."
          : `Failed to load timesheet (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as TimesheetDTO;
}

// ---- Admin ----------------------------------------------------------------

export interface AdminSession {
  id: string;
  email: string;
  name: string;
}

/** Current admin session, or null if not signed in. */
export async function adminMe(): Promise<AdminSession | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return (await res.json()) as AdminSession;
}

/** Break-glass master-admin login (non-SSO email + password). */
export async function masterLogin(email: string, password: string): Promise<AdminSession> {
  const res = await fetch("/api/auth/master-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status === 401 ? "Incorrect email or password." : `Login failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as AdminSession;
}

export async function adminLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export interface JibblePersonSummary {
  id: string;
  fullName: string;
  email: string;
  pinCode: string | null;
  role: string;
  status: string;
}

export interface EmployeeAccount {
  id: string;
  email: string;
  fullName: string;
  jibblePersonId: string | null;
  isAdmin: boolean;
  managerEmail: string | null;
  active: boolean;
  createdAt: string;
}

/** All app accounts (for the org-chart screen). */
export async function fetchPeople(): Promise<EmployeeAccount[]> {
  const res = await fetch("/api/admin/people", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load people (${res.status})`, res.status);
  return (await res.json()) as EmployeeAccount[];
}

/** Master-admin: set a person's approver and/or admin flag. */
export async function updatePerson(
  email: string,
  patch: { managerEmail?: string | null; isAdmin?: boolean }
): Promise<EmployeeAccount> {
  const res = await fetch(`/api/admin/people/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(
      body?.error === "master_admin_only"
        ? "Only the master admin can edit the org chart."
        : `Update failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as EmployeeAccount;
}

export async function adminListJibblePeople(): Promise<JibblePersonSummary[]> {
  const res = await fetch("/api/admin/jibble-people", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load people (${res.status})`, res.status);
  return (await res.json()) as JibblePersonSummary[];
}

export async function adminListEmployees(): Promise<EmployeeAccount[]> {
  const res = await fetch("/api/admin/employees", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load accounts (${res.status})`, res.status);
  return (await res.json()) as EmployeeAccount[];
}

/** Master-admin: manually provision an SSO-ready account for a Jibble person. */
export async function adminCreateEmployee(
  jibblePersonId: string,
  opts?: { isAdmin?: boolean; managerEmail?: string | null }
): Promise<{ account: EmployeeAccount }> {
  const res = await fetch("/api/admin/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ jibblePersonId, ...opts }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const msg =
      body?.error === "account_exists"
        ? "This person already has an account."
        : body?.error === "master_admin_only"
          ? "Only the master admin can add people."
          : `Failed to create account (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as { account: EmployeeAccount };
}

/** Fetch the admin review queue for a given status. */
export async function fetchAdminQueue(status = "pending"): Promise<CorrectionRequestDTO[]> {
  const res = await fetch(`/api/admin/requests?status=${encodeURIComponent(status)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(`Failed to load queue (${res.status})`, res.status);
  return (await res.json()) as CorrectionRequestDTO[];
}

/** Fetch the decision log (every decided request, newest first). */
export async function fetchAdminLog(): Promise<CorrectionRequestDTO[]> {
  const res = await fetch("/api/admin/log", { credentials: "include" });
  if (!res.ok) throw new ApiError(`Failed to load log (${res.status})`, res.status);
  return (await res.json()) as CorrectionRequestDTO[];
}

/** Approve or deny a request. */
export async function submitDecision(
  id: string,
  decision: "approved" | "denied",
  note?: string
): Promise<CorrectionRequestDTO> {
  const res = await fetch(`/api/admin/requests/${id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ decision, note }),
  });
  if (!res.ok) throw new ApiError(`Decision failed (${res.status})`, res.status);
  return (await res.json()) as CorrectionRequestDTO;
}

import type { CorrectionRequestDTO, CreateCorrectionRequest, TimesheetDTO } from "@timesheet/shared";

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

// ---- Employee accounts ----------------------------------------------------

export interface EmployeeProfile {
  email: string;
  fullName: string;
  jibblePersonId: string | null;
}

export async function employeeMe(): Promise<EmployeeProfile | null> {
  const res = await fetch("/api/employee/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return (await res.json()) as EmployeeProfile;
}

export async function employeeLogin(email: string, password: string): Promise<EmployeeProfile> {
  const res = await fetch("/api/employee/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status === 401 ? "Incorrect email or password." : `Sign in failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as EmployeeProfile;
}

export async function employeeLogout(): Promise<void> {
  await fetch("/api/employee/logout", { method: "POST", credentials: "include" });
}

/** Request a magic link for the status lookup. `devLink` is present only in dev. */
export async function requestMagicLink(email: string): Promise<{ ok: boolean; devLink?: string }> {
  const res = await fetch("/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as { ok: boolean; devLink?: string };
}

/** Employee digitally signs off on a decided request. Uses the session, or a
 *  magic-link token when provided. */
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

/** Admin login with Jibble email + kiosk PIN (must be a Jibble Admin/Owner). */
export async function adminLogin(email: string, pin: string): Promise<AdminSession> {
  const res = await fetch("/api/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password: pin }),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status === 403
        ? "That Jibble account isn't an admin or owner."
        : res.status === 401
          ? "Incorrect email or kiosk PIN."
          : `Login failed (${res.status})`,
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
  createdAt: string;
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

export async function adminCreateEmployee(
  jibblePersonId: string,
  password?: string
): Promise<{ account: EmployeeAccount; tempPassword: string }> {
  const res = await fetch("/api/admin/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ jibblePersonId, ...(password ? { password } : {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const msg =
      body?.error === "account_exists"
        ? "This person already has an account."
        : body?.error === "no_default_password"
          ? "This person has no kiosk PIN — set a password manually."
          : `Failed to create account (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as { account: EmployeeAccount; tempPassword: string };
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

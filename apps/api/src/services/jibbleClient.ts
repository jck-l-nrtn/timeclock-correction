import { config } from "../config.js";
import type {
  CorrectionRequestDTO,
  TimesheetEntryDTO,
  ProfileDetailsDTO,
  PtoBalanceDTO,
  HolidayDTO,
  LeaveHistoryDTO,
  PayPeriodDef,
} from "@timesheet/shared";

/**
 * Jibble integration boundary.
 *
 * Everything the rest of the app knows about Jibble goes through this
 * interface. Phase 1 ships a STUB so the approval flow can be built and tested
 * without a live key. Phase 5 replaces the stub with `HttpJibbleClient`, which
 * talks to the real API:
 *
 *   - token:   POST {identity}/connect/token  (client_credentials)
 *   - people:  GET  {workspace}/v1/People?$filter=email eq '...'
 *   - write:   POST {timeTracking}/v1/TimeEntries   (create/adjust an entry)
 *
 * IMPORTANT UNKNOWN: whether the org's API key has WRITE scope on TimeEntries.
 * If it does not, `applyCorrection` should fall back to returning a
 * `manualInstruction` result instead of throwing, so an admin can apply it by
 * hand. Keeping that decision inside this adapter means no route code changes.
 *
 * ---------------------------------------------------------------------------
 * LIVE PROBE FINDINGS (verified 2026-07-01 against org Montane Packaging,
 * organizationId dc618cc8-1a03-495e-8099-b55f578a0279):
 *   - Token:  POST {identity}/connect/token  grant_type=client_credentials
 *             -> Bearer, expires_in 3600, scope "api1". WORKS.
 *   - People: GET {workspace}/v1/People  (OData $filter/$select). WORKS (org-wide read).
 *   - Read:   GET {timeTracking}/v1/TimeEntries. WORKS.
 *   - Write:  POST {timeTracking}/v1/TimeEntries — VERIFIED working (create +
 *             delete round-trip tested against the live org). The exact recipe:
 *               required: personId, type ("In"|"Out"), status:"Active",
 *                 time (UTC ISO, must NOT be in the future), offset (ISO-8601
 *                 duration e.g. "-PT6H"), belongsToDate (YYYY-MM-DD),
 *                 platform (required; {isQrKiosk:false} is enough), and all the
 *                 is* booleans (isManual:true, isOffline:false, ...).
 *               DO NOT send `localTime` — the server derives it from time+offset;
 *                 sending it is what triggers "Value cannot be null
 *                 (Parameter 'nullableType')".
 *             The API also enforces business rules we surface as `failed`:
 *               locked pay periods, no two clock-outs in a row, no future times.
 *   - Delete entry: DELETE {timeTracking}/v1/TimeEntries(<guid>)  (UNQUOTED key).
 * ---------------------------------------------------------------------------
 */

export interface JibblePerson {
  id: string;
  fullName: string;
  email: string;
  /** IANA timezone (e.g. "America/Denver"), used to compute entry time + offset. */
  timeZone?: string;
}

/** A Jibble person as shown in the admin's "create account" picker. */
export interface JibblePersonSummary {
  id: string;
  fullName: string;
  email: string;
  /** Kiosk PIN — used as the default password when an admin creates an account. */
  pinCode: string | null;
  role: string;
  status: string;
}

export type ApplyResult =
  | { kind: "applied"; jibbleEntryId: string }
  | { kind: "manual"; instruction: string };

/** Raw Jibble TimeEntry fields we read (subset of the full entity). */
interface RawEntry {
  id: string;
  type: string;
  time: string;
  offset: string;
  belongsToDate: string;
  localTime?: string | null;
  note?: string | null;
  isManual?: boolean;
  isLocked?: boolean;
  status?: string;
}

interface RawBalance {
  personId: string;
  policyId: string;
  entitled?: number;
  taken?: number;
  balance?: number;
  carryForward?: number;
  kind?: string;
  isAssigned?: boolean;
}

interface RawPolicy {
  id: string;
  name: string;
  compensation?: string;
  kind?: string;
  status?: string;
}

export interface JibbleClient {
  /** Resolve a Jibble person by email, or null if not found. */
  findPersonByEmail(email: string): Promise<JibblePerson | null>;
  /** List org people for the admin account-creation picker. */
  listPeople(): Promise<JibblePersonSummary[]>;
  /** List a person's time entries within an inclusive date range (for the timesheet view). */
  listEntries(personId: string, fromDate: string, toDate: string): Promise<TimesheetEntryDTO[]>;
  /** Delete a time entry by id (used by the edit-as-replace flow). */
  deleteEntry(entryId: string): Promise<void>;
  /** Push the approved correction into Jibble (or return a manual fallback). */
  applyCorrection(request: CorrectionRequestDTO): Promise<ApplyResult>;
  /** Profile details (phone, role, status, start date) for the hub "My Info". */
  getProfile(personId: string): Promise<ProfileDetailsDTO | null>;
  /** A person's time-off policy balances (PTO). */
  getLeaveBalances(personId: string): Promise<PtoBalanceDTO[]>;
  /** A person's time-off balance change history (with comments). */
  getLeaveHistory(personId: string): Promise<LeaveHistoryDTO[]>;
  /** Person ids assigned to a time-off policy. */
  getPolicyAssignees(policyId: string): Promise<string[]>;
  /** Total worked hours (paired in→out) for a person in a date range. */
  workedHours(personId: string, from: string, to: string): Promise<number>;
  /** Worked hours for ALL people in a range as personId → (clock-in day → hours),
   *  from one bulk query — lets the caller apply weekly overtime caps. */
  getWorkedHoursByPerson(from: string, to: string): Promise<Map<string, Map<string, number>>>;
  /** Add a manual amendment to a person's entitlement on a policy (the comment = reason). */
  amendEntitlement(policyId: string, personId: string, amount: number, reason: string): Promise<void>;
  /** The organization's upcoming paid holidays. */
  getUpcomingHolidays(): Promise<HolidayDTO[]>;
  /** The org's default pay-period definition. */
  getPayPeriodDefinition(): Promise<PayPeriodDef>;
}

/** Sensible fallback pay period (Montane: biweekly, Sunday start). */
const DEFAULT_PAY_PERIOD: PayPeriodDef = {
  name: "Pay Period",
  cycle: "OnceInTwoWeeks",
  startFromDate: "2024-03-10",
  startAtDayOfWeek: "Sunday",
};

/**
 * Phase 1 stub. Deterministic, no network. Lets us exercise approve → apply
 * end-to-end in tests and the UI before real credentials exist.
 */
export class StubJibbleClient implements JibbleClient {
  async findPersonByEmail(_email: string): Promise<JibblePerson | null> {
    // Without real credentials we can't resolve a Jibble person; return null so
    // the app never stores a fabricated personId. The real client (Phase 5)
    // queries GET {workspace}/v1/People?$filter=email eq '...'.
    return null;
  }

  async listPeople(): Promise<JibblePersonSummary[]> {
    return [];
  }

  async listEntries(): Promise<TimesheetEntryDTO[]> {
    return [];
  }

  async deleteEntry(): Promise<void> {
    /* no-op in the stub */
  }

  async applyCorrection(request: CorrectionRequestDTO): Promise<ApplyResult> {
    return {
      kind: "manual",
      instruction:
        `[STUB] Would ${request.eventType === "adjust" ? "adjust" : `set clock-${request.eventType}`} ` +
        `for ${request.employeeEmail} on ${request.date} at ${request.intendedTime}. ` +
        `Connect a real Jibble key to apply automatically.`,
    };
  }

  async getProfile(): Promise<ProfileDetailsDTO | null> {
    return null;
  }

  async getLeaveBalances(): Promise<PtoBalanceDTO[]> {
    return [];
  }

  async getLeaveHistory(): Promise<LeaveHistoryDTO[]> {
    return [];
  }

  async getPolicyAssignees(): Promise<string[]> {
    return [];
  }

  async workedHours(): Promise<number> {
    return 0;
  }

  async getWorkedHoursByPerson(): Promise<Map<string, Map<string, number>>> {
    return new Map();
  }

  async amendEntitlement(): Promise<void> {
    /* no-op in the stub */
  }

  async getUpcomingHolidays(): Promise<HolidayDTO[]> {
    return [];
  }

  async getPayPeriodDefinition(): Promise<PayPeriodDef> {
    return DEFAULT_PAY_PERIOD;
  }
}

// ---------------------------------------------------------------------------
// Timezone math — Jibble stores a clock event as `time` (UTC) + `offset` (the
// person's UTC offset as an ISO-8601 duration, e.g. "-PT6H"). The employee gives
// us a local date + wall-clock time, so we convert using their timezone.
// ---------------------------------------------------------------------------

/** Minutes to add to a UTC instant to get local time in `timeZone` (Denver MDT = -360). */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - instant.getTime()) / 60000);
}

/** Format an offset in minutes as an ISO-8601 duration Jibble accepts ("-PT6H", "PT5H30M"). */
function toIsoDuration(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "";
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}PT${h}H${m ? `${m}M` : ""}`;
}

/** Convert a local date + HH:mm in a timezone to the UTC instant + Jibble offset. */
export function localWallToJibbleTime(
  dateISO: string,
  timeHHmm: string,
  timeZone: string
): { timeUtc: string; offset: string } {
  const [Y, M, D] = dateISO.split("-").map(Number);
  const [h, m] = timeHHmm.split(":").map(Number);
  const wallAsUtc = Date.UTC(Y, M - 1, D, h, m);
  // Estimate the offset at the wall instant, then refine once to settle DST edges.
  let off = tzOffsetMinutes(new Date(wallAsUtc), timeZone);
  off = tzOffsetMinutes(new Date(wallAsUtc - off * 60000), timeZone);
  const utcMs = wallAsUtc - off * 60000;
  return { timeUtc: new Date(utcMs).toISOString(), offset: toIsoDuration(off) };
}

/**
 * Real Jibble client. Verified against the live API (2026-07-01):
 *   - token is cached until shortly before expiry;
 *   - people are resolved via the workspace OData API;
 *   - a correction is applied by inserting a manual TimeEntry (In/Out). The
 *     insert deliberately omits `localTime` (server-derived) — sending it trips
 *     the API's `nullableType` error.
 */
export class HttpJibbleClient implements JibbleClient {
  private readonly cfg = config.jibble;
  private tokenCache: { value: string; expiresAt: number } | null = null;
  // Short-lived caches so a page that fires several calls doesn't re-hit Jibble
  // for the same person/timezone (the main cause of 429 rate-limit storms).
  private personCache = new Map<string, { at: number; val: JibblePerson | null }>();
  private tzCache = new Map<string, { at: number; val: string }>();
  private static readonly CACHE_TTL_MS = 5 * 60_000;

  /** GET with backoff retries on 429 (Jibble rate limit). */
  private async jfetch(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: await this.authHeaders() });
      if (res.status !== 429 || attempt >= 4) return res;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  private async getToken(): Promise<string> {
    // Reuse the cached token until 60s before it expires.
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.value;
    }
    const res = await fetch(`${this.cfg.baseIdentityUrl}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`Jibble token request failed (${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return json.access_token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getToken()}` };
  }

  async findPersonByEmail(email: string): Promise<JibblePerson | null> {
    const key = email.trim().toLowerCase();
    const cached = this.personCache.get(key);
    if (cached && Date.now() - cached.at < HttpJibbleClient.CACHE_TTL_MS) return cached.val;

    const filter = encodeURIComponent(`email eq '${email.replace(/'/g, "''")}'`);
    const url = `${this.cfg.baseWorkspaceUrl}/v1/People?$filter=${filter}&$select=id,fullName,email`;
    const res = await this.jfetch(url);
    if (!res.ok) throw new Error(`Jibble people lookup failed (${res.status})`);
    const json = (await res.json()) as {
      value: { id: string; fullName: string; email: string }[];
    };
    const p = json.value?.[0];
    const val: JibblePerson | null = p
      ? { id: p.id, fullName: p.fullName, email: p.email, timeZone: await this.resolveTimeZone(p.id) }
      : null;
    this.personCache.set(key, { at: Date.now(), val });
    return val;
  }

  async listPeople(): Promise<JibblePersonSummary[]> {
    const url =
      `${this.cfg.baseWorkspaceUrl}/v1/People` +
      `?$select=id,fullName,email,pinCode,role,status&$orderby=${encodeURIComponent("fullName")}&$top=500`;
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Jibble people list failed (${res.status})`);
    const json = (await res.json()) as {
      value: { id: string; fullName: string; email: string; pinCode?: string; role?: string; status?: string }[];
    };
    return (json.value ?? [])
      .filter((p) => p.email) // only people we can create an email-based login for
      .map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        pinCode: p.pinCode ?? null,
        role: p.role ?? "",
        status: p.status ?? "",
      }));
  }

  async getProfile(email: string): Promise<ProfileDetailsDTO | null> {
    const filter = encodeURIComponent(`email eq '${email.replace(/'/g, "''")}'`);
    const url =
      `${this.cfg.baseWorkspaceUrl}/v1/People?$filter=${filter}` +
      `&$select=fullName,email,phoneNumber,role,status,workStartDate,joinDate`;
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Jibble profile lookup failed (${res.status})`);
    const json = (await res.json()) as {
      value: {
        fullName: string;
        email: string;
        phoneNumber?: string | null;
        role?: string | null;
        status?: string | null;
        workStartDate?: string | null;
        joinDate?: string | null;
      }[];
    };
    const p = json.value?.[0];
    if (!p) return null;
    const start = p.workStartDate ?? p.joinDate ?? null;
    return {
      fullName: p.fullName,
      email: p.email,
      phoneNumber: p.phoneNumber ?? null,
      role: p.role ?? null,
      status: p.status ?? null,
      startDate: start ? start.slice(0, 10) : null,
    };
  }

  async getLeaveBalances(personId: string): Promise<PtoBalanceDTO[]> {
    const balFilter = encodeURIComponent(`personId eq ${personId}`);
    const [balRes, polRes] = await Promise.all([
      fetch(`${this.cfg.baseTimeTrackingUrl}/v1/LeaveBalances?$filter=${balFilter}`, {
        headers: await this.authHeaders(),
      }),
      fetch(`${this.cfg.baseWorkspaceUrl}/v1/TimeOffPolicies?$top=200`, {
        headers: await this.authHeaders(),
      }),
    ]);
    if (!balRes.ok) throw new Error(`Jibble leave balances failed (${balRes.status})`);
    if (!polRes.ok) throw new Error(`Jibble time-off policies failed (${polRes.status})`);
    const balances = ((await balRes.json()) as { value: RawBalance[] }).value ?? [];
    const policies = ((await polRes.json()) as { value: RawPolicy[] }).value ?? [];
    const byId = new Map(policies.map((p) => [p.id, p]));
    return balances
      .filter((b) => b.isAssigned)
      .map((b) => {
        const pol = byId.get(b.policyId);
        return {
          policyId: b.policyId,
          policyName: pol?.name ?? "Time off",
          compensation: pol?.compensation ?? "",
          unit: pol?.kind ?? b.kind ?? "Hours",
          entitled: b.entitled ?? 0,
          taken: b.taken ?? 0,
          balance: b.balance ?? 0,
          carryForward: b.carryForward ?? 0,
        };
      });
  }

  async getLeaveHistory(personId: string): Promise<LeaveHistoryDTO[]> {
    const filter = encodeURIComponent(`personId eq ${personId}`);
    const [histRes, polRes] = await Promise.all([
      this.jfetch(`${this.cfg.baseTimeTrackingUrl}/v1/TimeOffHistories?$filter=${filter}&$top=500`),
      this.jfetch(`${this.cfg.baseWorkspaceUrl}/v1/TimeOffPolicies?$top=200`),
    ]);
    if (!histRes.ok) throw new Error(`Jibble time-off history failed (${histRes.status})`);
    const rows =
      ((await histRes.json()) as {
        value: Array<{
          id: string;
          policyId: string;
          timestamp: string;
          change?: number;
          action?: string;
          description?: string;
        }>;
      }).value ?? [];
    const policies = polRes.ok ? ((await polRes.json()) as { value: RawPolicy[] }).value ?? [] : [];
    const byId = new Map(policies.map((p) => [p.id, p]));
    return rows
      .map((r) => {
        const pol = byId.get(r.policyId);
        return {
          id: r.id,
          policyId: r.policyId,
          policyName: pol?.name ?? "Time off",
          timestamp: r.timestamp,
          change: r.change ?? 0,
          action: r.action ?? "",
          description: r.description ?? "",
          unit: pol?.kind ?? "Hours",
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async getPolicyAssignees(policyId: string): Promise<string[]> {
    const filter = encodeURIComponent(`policyId eq ${policyId}`);
    const res = await this.jfetch(`${this.cfg.baseTimeTrackingUrl}/v1/LeaveBalances?$filter=${filter}`);
    if (!res.ok) throw new Error(`Jibble policy assignees failed (${res.status})`);
    const rows = ((await res.json()) as { value: Array<{ personId: string; isAssigned?: boolean }> }).value ?? [];
    return rows.filter((r) => r.isAssigned).map((r) => r.personId);
  }

  async workedHours(personId: string, from: string, to: string): Promise<number> {
    const entries = await this.listEntries(personId, from, to);
    const sorted = [...entries].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
    let total = 0;
    let open: TimesheetEntryDTO | null = null;
    for (const e of sorted) {
      if (e.type.toLowerCase() === "in") open = e;
      else if (open) {
        total += (new Date(e.timeUtc).getTime() - new Date(open.timeUtc).getTime()) / 3600000;
        open = null;
      }
    }
    return total;
  }

  async getWorkedHoursByPerson(from: string, to: string): Promise<Map<string, Map<string, number>>> {
    const filter = encodeURIComponent(`belongsToDate ge ${from} and belongsToDate le ${to}`);
    let url =
      `${this.cfg.baseTimeTrackingUrl}/v1/TimeEntries?$filter=${filter}` +
      `&$orderby=${encodeURIComponent("time asc")}&$select=personId,type,time,belongsToDate&$top=1000`;
    type Row = { personId: string; type: string; time: string; belongsToDate: string };
    const rows: Row[] = [];
    for (let page = 0; url && page < 25; page++) {
      const res = await this.jfetch(url);
      if (!res.ok) throw new Error(`Jibble bulk entries failed (${res.status})`);
      const j = (await res.json()) as { value?: Row[]; ["@odata.nextLink"]?: string };
      rows.push(...(j.value ?? []));
      url = j["@odata.nextLink"] ?? "";
    }
    const byPerson = new Map<string, Row[]>();
    for (const r of rows) {
      const list = byPerson.get(r.personId) ?? [];
      list.push(r);
      byPerson.set(r.personId, list);
    }
    // Pair in→out in time order; attribute each shift's hours to the clock-in day.
    const perPerson = new Map<string, Map<string, number>>();
    for (const [pid, list] of byPerson) {
      list.sort((a, b) => a.time.localeCompare(b.time));
      const perDay = new Map<string, number>();
      let open: Row | null = null;
      for (const e of list) {
        if (e.type.toLowerCase() === "in") open = e;
        else if (open) {
          const hrs = (new Date(e.time).getTime() - new Date(open.time).getTime()) / 3600000;
          perDay.set(open.belongsToDate, (perDay.get(open.belongsToDate) ?? 0) + hrs);
          open = null;
        }
      }
      perPerson.set(pid, perDay);
    }
    return perPerson;
  }

  async amendEntitlement(policyId: string, personId: string, amount: number, reason: string): Promise<void> {
    if (this.cfg.dryRun) {
      console.log(`[jibble DRY RUN] amend ${personId} on ${policyId}: ${amount} — "${reason}"`);
      return;
    }
    const url = `${this.cfg.baseTimeTrackingUrl}/v1/TimeOffPolicies(${policyId})/Jibble.TimeTracking.Data.Entities.AmendEntitlement`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...(await this.authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ personId, reason, amendment: amount }),
    });
    if (!res.ok) {
      throw new Error(`Jibble amend failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
  }

  async getUpcomingHolidays(): Promise<HolidayDTO[]> {
    const url = `${this.cfg.baseWorkspaceUrl}/v1/UpcomingHolidays?$top=100`;
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Jibble holidays failed (${res.status})`);
    const rows = ((await res.json()) as { value: { date: string; name: string }[] }).value ?? [];
    return rows
      .map((h) => ({ date: (h.date ?? "").slice(0, 10), name: h.name }))
      .filter((h) => h.date && h.name)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getPayPeriodDefinition(): Promise<PayPeriodDef> {
    try {
      const res = await fetch(`${this.cfg.baseWorkspaceUrl}/v1/PayPeriodDefinitions?$top=50`, {
        headers: await this.authHeaders(),
      });
      if (!res.ok) return DEFAULT_PAY_PERIOD;
      const rows = ((await res.json()) as { value: Array<Record<string, unknown>> }).value ?? [];
      const def = (rows.find((r) => r.default === true) ?? rows[0]) as
        | { name?: string; cycle?: string; startFromDate?: string; startAtDayOfWeek?: string }
        | undefined;
      if (!def?.startFromDate) return DEFAULT_PAY_PERIOD;
      return {
        name: def.name ?? "Pay Period",
        cycle: def.cycle ?? "OnceInTwoWeeks",
        startFromDate: def.startFromDate.slice(0, 10),
        startAtDayOfWeek: def.startAtDayOfWeek ?? "Sunday",
      };
    } catch (err) {
      console.warn("[jibble] pay-period definition failed (non-fatal):", err);
      return DEFAULT_PAY_PERIOD;
    }
  }

  async listEntries(personId: string, fromDate: string, toDate: string): Promise<TimesheetEntryDTO[]> {
    const filter = encodeURIComponent(
      `personId eq ${personId} and belongsToDate ge ${fromDate} and belongsToDate le ${toDate}`
    );
    const url =
      `${this.cfg.baseTimeTrackingUrl}/v1/TimeEntries?$filter=${filter}` +
      `&$orderby=${encodeURIComponent("time asc")}` +
      `&$select=id,type,time,offset,localTime,belongsToDate,note,isManual,isLocked,status&$top=200`;
    const res = await this.jfetch(url);
    if (!res.ok) throw new Error(`Jibble list entries failed (${res.status})`);
    const json = (await res.json()) as { value?: RawEntry[] };
    return (json.value ?? []).map((e) => ({
      id: e.id,
      type: e.type,
      timeUtc: e.time,
      localTime: e.localTime ?? null,
      offset: e.offset ?? null,
      belongsToDate: e.belongsToDate,
      note: e.note ?? null,
      isManual: !!e.isManual,
      isLocked: !!e.isLocked,
      status: e.status ?? "",
    }));
  }

  async deleteEntry(entryId: string): Promise<void> {
    // Guid keys are UNQUOTED in the OData path.
    const res = await fetch(`${this.cfg.baseTimeTrackingUrl}/v1/TimeEntries(${entryId})`, {
      method: "DELETE",
      headers: await this.authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Jibble delete entry failed (${res.status}): ${text.slice(0, 200)}`);
    }
  }

  private async getEntry(id: string): Promise<RawEntry | null> {
    const filter = encodeURIComponent(`id eq ${id}`);
    const url = `${this.cfg.baseTimeTrackingUrl}/v1/TimeEntries?$filter=${filter}&$select=id,type,time,offset,belongsToDate,note,isLocked`;
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Jibble get entry failed (${res.status})`);
    const json = (await res.json()) as { value?: RawEntry[] };
    return json.value?.[0] ?? null;
  }

  /** Best-effort per-person timezone from the time-tracking People projection. */
  private async resolveTimeZone(personId: string): Promise<string> {
    const cached = this.tzCache.get(personId);
    if (cached && Date.now() - cached.at < HttpJibbleClient.CACHE_TTL_MS) return cached.val;
    let tz = this.cfg.orgTimeZone;
    try {
      const filter = encodeURIComponent(`id eq ${personId}`);
      const url = `${this.cfg.baseTimeTrackingUrl}/v1/People?$filter=${filter}&$select=timeZone,timeSheetTimeZone`;
      const res = await this.jfetch(url);
      if (res.ok) {
        const json = (await res.json()) as {
          value: { timeZone?: string; timeSheetTimeZone?: string }[];
        };
        const row = json.value?.[0];
        tz = row?.timeSheetTimeZone || row?.timeZone || this.cfg.orgTimeZone;
      }
    } catch {
      /* fall through to org default */
    }
    this.tzCache.set(personId, { at: Date.now(), val: tz });
    return tz;
  }

  async applyCorrection(request: CorrectionRequestDTO): Promise<ApplyResult> {
    // Dry-run: don't write to Jibble — report what would happen.
    if (this.cfg.dryRun) {
      return {
        kind: "manual",
        instruction:
          `[DRY RUN] Would ${request.jibbleEntryId ? "replace entry " + request.jibbleEntryId : `add a ${request.eventType} entry`} ` +
          `for ${request.employeeEmail} on ${request.date} at ${request.intendedTime}. No change made in Jibble.`,
      };
    }

    const person = request.jibblePersonId
      ? { id: request.jibblePersonId }
      : await this.findPersonByEmail(request.employeeEmail);
    if (!person) throw new Error(`No Jibble person found for ${request.employeeEmail}`);

    // Use the PERSON's own timezone (not the org default) so the corrected local
    // wall-clock time maps to the right UTC instant. Resolved live from Jibble.
    const timeZone = await this.resolveTimeZone(person.id);
    const { timeUtc, offset } = localWallToJibbleTime(request.date, request.intendedTime, timeZone);
    // Stamp the Jibble entry note with the approver, approval timestamp, the
    // employee's reason, and the admin's note — a self-contained audit trail on
    // the entry itself.
    const approver = request.decidedBy ?? "admin";
    const when = request.decidedAt
      ? new Date(request.decidedAt).toLocaleString("en-US", { timeZone })
      : "";
    const adminNote = request.decisionNote ? ` | Admin note: ${request.decisionNote}` : "";
    const note = `Correction approved by ${approver}${when ? ` on ${when}` : ""}. Reason: ${request.reason}${adminNote}`.slice(0, 500);

    // EDIT an existing entry: replace it (delete old, create new; roll back on
    // failure so we never lose the original).
    if (request.jibbleEntryId) {
      return this.replaceEntry(request.jibbleEntryId, person.id, timeUtc, offset, request.date, note);
    }

    // NEW missed shift: always create BOTH a clock-in and a clock-out so Jibble
    // never gets an orphan punch. `intendedTime` = clock-in, `endTime` = clock-out.
    if (!request.endTime) {
      return {
        kind: "manual",
        instruction:
          `Missed entry for ${request.employeeEmail} on ${request.date}: no clock-out time was ` +
          `provided — add the full in/out shift in Jibble manually.`,
      };
    }
    const out = localWallToJibbleTime(request.date, request.endTime, timeZone);
    const inId = await this.createTimeEntry({
      personId: person.id,
      type: "In",
      timeUtc,
      offset,
      belongsToDate: request.date,
      note,
    });
    const outId = await this.createTimeEntry({
      personId: person.id,
      type: "Out",
      timeUtc: out.timeUtc,
      offset: out.offset,
      belongsToDate: request.date,
      note,
    });
    return { kind: "applied", jibbleEntryId: `${inId},${outId}` };
  }

  /** Replace an existing entry's time: delete the old, create a new one at the
   *  corrected time keeping the original type. Rolls the original back if the
   *  create fails, so a failed edit never destroys data. */
  private async replaceEntry(
    oldEntryId: string,
    personId: string,
    timeUtc: string,
    offset: string,
    belongsToDate: string,
    note: string
  ): Promise<ApplyResult> {
    const old = await this.getEntry(oldEntryId);
    if (!old) throw new Error(`Target entry ${oldEntryId} not found (already changed?)`);
    if (old.isLocked) throw new Error("Target entry is in a locked pay period and can't be changed.");
    if (old.type !== "In" && old.type !== "Out") {
      throw new Error(`Unsupported entry type "${old.type}"`);
    }

    await this.deleteEntry(old.id);
    try {
      const newId = await this.createTimeEntry({ personId, type: old.type, timeUtc, offset, belongsToDate, note });
      return { kind: "applied", jibbleEntryId: newId };
    } catch (err) {
      // Roll back — recreate the original entry from what we captured.
      try {
        await this.createTimeEntry({
          personId,
          type: old.type,
          timeUtc: old.time,
          offset: old.offset,
          belongsToDate: old.belongsToDate,
          note: old.note ?? "",
        });
      } catch {
        /* best-effort rollback */
      }
      throw err;
    }
  }

  private async createTimeEntry(e: {
    personId: string;
    type: "In" | "Out";
    timeUtc: string;
    offset: string;
    belongsToDate: string;
    note: string;
  }): Promise<string> {
    const body = {
      personId: e.personId,
      type: e.type,
      clientType: "Zapier",
      status: "Active",
      time: e.timeUtc,
      offset: e.offset,
      belongsToDate: e.belongsToDate,
      isManual: true,
      isOffline: false,
      isAutomatic: false,
      isOutsideGeofence: false,
      isManualLocation: false,
      isUnusual: false,
      isEndOfDay: false,
      isFromSpeedKiosk: false,
      note: e.note,
      // NOTE: do NOT include `localTime` — the server derives it; sending it
      // triggers the API's `nullableType` error. `platform` is required.
      platform: { isQrKiosk: false, clientVersion: "0.1", os: "api", deviceName: "timeclock-corrections" },
    };
    const res = await fetch(`${this.cfg.baseTimeTrackingUrl}/v1/TimeEntries`, {
      method: "POST",
      headers: { ...(await this.authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jibble create entry failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { id: string };
    return json.id;
  }
}

/** Factory — real client when credentials exist, else the offline stub. */
export function createJibbleClient(): JibbleClient {
  const hasCreds = Boolean(config.jibble.clientId && config.jibble.clientSecret);
  return hasCreds ? new HttpJibbleClient() : new StubJibbleClient();
}

export const jibbleClient = createJibbleClient();

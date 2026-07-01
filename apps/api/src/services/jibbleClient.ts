import { config } from "../config.js";
import type { CorrectionRequestDTO, TimesheetEntryDTO } from "@timesheet/shared";

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
}

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
    const filter = encodeURIComponent(`email eq '${email.replace(/'/g, "''")}'`);
    const url = `${this.cfg.baseWorkspaceUrl}/v1/People?$filter=${filter}&$select=id,fullName,email`;
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Jibble people lookup failed (${res.status})`);
    const json = (await res.json()) as {
      value: { id: string; fullName: string; email: string }[];
    };
    const p = json.value?.[0];
    if (!p) return null;
    return { id: p.id, fullName: p.fullName, email: p.email, timeZone: await this.resolveTimeZone(p.id) };
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

  async listEntries(personId: string, fromDate: string, toDate: string): Promise<TimesheetEntryDTO[]> {
    const filter = encodeURIComponent(
      `personId eq ${personId} and belongsToDate ge ${fromDate} and belongsToDate le ${toDate}`
    );
    const url =
      `${this.cfg.baseTimeTrackingUrl}/v1/TimeEntries?$filter=${filter}` +
      `&$orderby=${encodeURIComponent("time asc")}` +
      `&$select=id,type,time,localTime,belongsToDate,note,isManual,isLocked,status&$top=200`;
    const res = await fetch(url, { headers: await this.authHeaders() });
    if (!res.ok) throw new Error(`Jibble list entries failed (${res.status})`);
    const json = (await res.json()) as { value?: RawEntry[] };
    return (json.value ?? []).map((e) => ({
      id: e.id,
      type: e.type,
      timeUtc: e.time,
      localTime: e.localTime ?? null,
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
    try {
      const filter = encodeURIComponent(`id eq ${personId}`);
      const url = `${this.cfg.baseTimeTrackingUrl}/v1/People?$filter=${filter}&$select=timeZone,timeSheetTimeZone`;
      const res = await fetch(url, { headers: await this.authHeaders() });
      if (res.ok) {
        const json = (await res.json()) as {
          value: { timeZone?: string; timeSheetTimeZone?: string }[];
        };
        const row = json.value?.[0];
        return row?.timeSheetTimeZone || row?.timeZone || this.cfg.orgTimeZone;
      }
    } catch {
      /* fall through to org default */
    }
    return this.cfg.orgTimeZone;
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
      ? { id: request.jibblePersonId, timeZone: this.cfg.orgTimeZone }
      : await this.findPersonByEmail(request.employeeEmail);
    if (!person) throw new Error(`No Jibble person found for ${request.employeeEmail}`);

    const timeZone = person.timeZone || this.cfg.orgTimeZone;
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

    // NEW entry: only a missed clock-in/out is auto-creatable. An "adjust" with
    // no target entry can't be auto-applied — hand it to an admin.
    if (request.eventType !== "in" && request.eventType !== "out") {
      return {
        kind: "manual",
        instruction:
          `Time adjustment for ${request.employeeEmail} on ${request.date} to ${request.intendedTime}: ` +
          `no existing entry was selected — correct it in Jibble manually.`,
      };
    }

    const entryId = await this.createTimeEntry({
      personId: person.id,
      type: request.eventType === "in" ? "In" : "Out",
      timeUtc,
      offset,
      belongsToDate: request.date,
      note,
    });
    return { kind: "applied", jibbleEntryId: entryId };
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

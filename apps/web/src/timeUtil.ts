import type { TimesheetEntryDTO } from "@timesheet/shared";

// ---- local date helpers (never UTC — avoids the evening day-roll bug) -------
export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => new Date(s + "T00:00:00");
export const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
export const startOfWeek = (d: Date) => addDays(d, -d.getDay()); // Sunday
export const todayYmd = () => ymd(new Date());

/** Parse an ISO-8601 duration offset ("-PT6H", "PT5H30M") to minutes. */
export function offsetMinutes(offset: string | null): number | null {
  if (!offset) return null;
  const m = /^(-)?PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(offset);
  if (!m) return null;
  return (Number(m[2] || 0) * 60 + Number(m[3] || 0)) * (m[1] ? -1 : 1);
}

/** The entry's local wall-clock HH:mm — from localTime, else timeUtc+offset. */
export function entryHHmm(e: TimesheetEntryDTO): string {
  if (e.localTime) {
    const t = e.localTime.split("T")[1];
    if (t) return t.slice(0, 5);
  }
  const off = offsetMinutes(e.offset);
  if (off !== null) {
    const local = new Date(new Date(e.timeUtc).getTime() + off * 60000);
    return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  }
  const t = e.timeUtc.split("T")[1];
  return t ? t.slice(0, 5) : "";
}

export const isIn = (e: TimesheetEntryDTO) => e.type.toLowerCase() === "in";

/** Hours worked for a set of punches: pair In→Out by UTC and sum (tz-safe). */
export function hoursFor(entries: TimesheetEntryDTO[]): number {
  const sorted = [...entries].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
  let total = 0;
  let open: TimesheetEntryDTO | null = null;
  for (const e of sorted) {
    if (isIn(e)) open = e;
    else if (open) {
      total += (new Date(e.timeUtc).getTime() - new Date(open.timeUtc).getTime()) / 3600000;
      open = null;
    }
  }
  return total;
}

/** Group entries by their belongsToDate (sorted within each day). */
export function groupByDay(entries: TimesheetEntryDTO[]): Map<string, TimesheetEntryDTO[]> {
  const m = new Map<string, TimesheetEntryDTO[]>();
  for (const e of entries) {
    const list = m.get(e.belongsToDate) ?? [];
    list.push(e);
    m.set(e.belongsToDate, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
  return m;
}

export const fmtHoursNum = (h: number) => (Math.round(h * 100) / 100).toFixed(2);
export const fmtHM = (h: number) => {
  const mins = Math.round(h * 60);
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
};

/** True if this day's last punch is an unmatched "in" (currently clocked in). */
export function openPunch(entries: TimesheetEntryDTO[]): TimesheetEntryDTO | null {
  const sorted = [...entries].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
  const last = sorted[sorted.length - 1];
  return last && isIn(last) ? last : null;
}

export interface Shift {
  inEntry: TimesheetEntryDTO | null; // null = an out with no matching in
  outEntry: TimesheetEntryDTO | null; // null = open, or a missed clock-out
  /** True only for the single trailing unmatched in (currently clocked in). */
  open: boolean;
}

/**
 * Pair punches into shifts across day boundaries (handles overnight shifts).
 * Walk entries in time order: each "in" opens a shift, each "out" closes it.
 * Only the final still-open "in" is marked `open`.
 */
export function buildShifts(entries: TimesheetEntryDTO[]): Shift[] {
  const sorted = [...entries].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
  const shifts: Shift[] = [];
  let openIn: TimesheetEntryDTO | null = null;
  for (const e of sorted) {
    if (isIn(e)) {
      if (openIn) shifts.push({ inEntry: openIn, outEntry: null, open: false }); // missed clock-out
      openIn = e;
    } else if (openIn) {
      shifts.push({ inEntry: openIn, outEntry: e, open: false });
      openIn = null;
    } else {
      shifts.push({ inEntry: null, outEntry: e, open: false }); // out whose in is before the range
    }
  }
  if (openIn) shifts.push({ inEntry: openIn, outEntry: null, open: true });
  return shifts;
}

/** The calendar day a shift is attributed to (its clock-in day). */
export const shiftDay = (s: Shift): string | null =>
  s.inEntry?.belongsToDate ?? s.outEntry?.belongsToDate ?? null;

/** Hours in a completed shift (0 if open/incomplete). */
export function shiftHours(s: Shift): number {
  if (!s.inEntry || !s.outEntry) return 0;
  return (new Date(s.outEntry.timeUtc).getTime() - new Date(s.inEntry.timeUtc).getTime()) / 3600000;
}

/** Group shifts by their clock-in day. */
export function shiftsByDay(entries: TimesheetEntryDTO[]): Map<string, Shift[]> {
  const m = new Map<string, Shift[]>();
  for (const s of buildShifts(entries)) {
    const d = shiftDay(s);
    if (!d) continue;
    const list = m.get(d) ?? [];
    list.push(s);
    m.set(d, list);
  }
  return m;
}

export interface Segment {
  in: string; // HH:mm or "—"
  out: string | null; // HH:mm, or null if still open
}
/** Pair a day's punches into in→out segments for display. */
export function pairSegments(entries: TimesheetEntryDTO[]): Segment[] {
  const sorted = [...entries].sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
  const segs: Segment[] = [];
  let open: TimesheetEntryDTO | null = null;
  for (const e of sorted) {
    if (isIn(e)) {
      if (open) segs.push({ in: entryHHmm(open), out: null });
      open = e;
    } else {
      segs.push({ in: open ? entryHHmm(open) : "—", out: entryHHmm(e) });
      open = null;
    }
  }
  if (open) segs.push({ in: entryHHmm(open), out: null });
  return segs;
}

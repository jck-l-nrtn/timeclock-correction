import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EventType,
  type CorrectionRequestDTO,
  type HolidayDTO,
  type TimesheetEntryDTO,
} from "@timesheet/shared";
import { fetchHolidays, fetchMyRequests, fetchTimesheet, type EmployeeProfile } from "../api.js";
import { addDays, entryHHmm, hoursFor as dayHours, isIn, parseYmd, startOfWeek, ymd } from "../timeUtil.js";
import { CorrectionForm, type CorrectionFormInitial } from "./CorrectionForm.js";
import { PtoForm } from "./PtoForm.js";

const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
const isToday = (d: Date) => ymd(d) === ymd(new Date());
const fmtHours = (h: number) => (h <= 0 ? "" : `${h.toFixed(2)}h`);

interface TimeOffDay {
  ptoType: string;
  status: string;
}

export function TimesheetCalendar({ profile }: { profile: EmployeeProfile }) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [entries, setEntries] = useState<TimesheetEntryDTO[]>([]);
  const [requests, setRequests] = useState<CorrectionRequestDTO[]>([]);
  const [holidays, setHolidays] = useState<HolidayDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { kind: "correction"; initial: CorrectionFormInitial; heading: string }
    | { kind: "timeoff"; date: string }
    | null
  >(null);

  // Visible range (local days).
  const range = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return { start: gridStart, end: days[41], days };
  }, [mode, anchor]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTimesheet(ymd(range.start), ymd(range.end)),
      fetchMyRequests().catch(() => [] as CorrectionRequestDTO[]),
      fetchHolidays().catch(() => [] as HolidayDTO[]),
    ])
      .then(([ts, reqs, hols]) => {
        setEntries(ts.entries);
        setRequests(reqs);
        setHolidays(hols);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load timesheet"))
      .finally(() => setLoading(false));
  }, [range.start, range.end]);

  useEffect(load, [load]);

  // Index data by day.
  const entriesByDay = useMemo(() => {
    const m = new Map<string, TimesheetEntryDTO[]>();
    for (const e of entries) {
      const list = m.get(e.belongsToDate) ?? [];
      list.push(e);
      m.set(e.belongsToDate, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
    return m;
  }, [entries]);

  const holidaysByDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date, h.name);
    return m;
  }, [holidays]);

  const timeOffByDay = useMemo(() => {
    const m = new Map<string, TimeOffDay>();
    for (const r of requests) {
      if (r.kind !== "timeoff" || r.status === "denied") continue;
      if (!r.startDate) continue;
      let d = parseYmd(r.startDate);
      const end = parseYmd(r.endDate || r.startDate);
      while (d <= end) {
        m.set(ymd(d), { ptoType: r.ptoType ?? "time off", status: r.status });
        d = addDays(d, 1);
      }
    }
    return m;
  }, [requests]);

  const pendingCorrectionDays = useMemo(() => {
    const s = new Set<string>();
    for (const r of requests) {
      if (r.kind === "correction" && r.status === "pending" && r.date) s.add(r.date);
    }
    return s;
  }, [requests]);

  // Modal openers.
  const openChange = (e: TimesheetEntryDTO) =>
    setModal({
      kind: "correction",
      heading: `Request a change to this ${e.type} punch`,
      initial: {
        employeeName: profile.fullName,
        employeeEmail: profile.email,
        jibblePersonId: profile.jibblePersonId ?? undefined,
        jibbleEntryId: e.id,
        date: e.belongsToDate,
        eventType: EventType.Adjustment,
        intendedTime: entryHHmm(e),
      },
    });
  const openAdd = (day: string, type: EventType) =>
    setModal({
      kind: "correction",
      heading: type === EventType.ClockIn ? "Add a missing clock-in" : "Add a missing clock-out",
      initial: {
        employeeName: profile.fullName,
        employeeEmail: profile.email,
        jibblePersonId: profile.jibblePersonId ?? undefined,
        date: day,
        eventType: type,
      },
    });

  const title =
    mode === "week"
      ? `${range.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${range.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const step = (dir: number) =>
    setAnchor((a) => (mode === "week" ? addDays(a, dir * 7) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));

  const weekTotal = useMemo(() => {
    if (mode !== "week") return 0;
    return range.days.reduce((sum, d) => sum + dayHours(entriesByDay.get(ymd(d)) ?? []), 0);
  }, [mode, range.days, entriesByDay]);

  return (
    <section className="card cal-card">
      <div className="cal-head">
        <div className="cal-nav">
          <button className="btn-secondary btn-inline" onClick={() => step(-1)}>←</button>
          <button className="btn-secondary btn-inline" onClick={() => setAnchor(new Date())}>Today</button>
          <button className="btn-secondary btn-inline" onClick={() => step(1)}>→</button>
          <h1 className="cal-title">{title}</h1>
        </div>
        <div className="cal-modes">
          <button className={mode === "month" ? "tab tab-active" : "tab"} onClick={() => setMode("month")}>Month</button>
          <button className={mode === "week" ? "tab tab-active" : "tab"} onClick={() => setMode("week")}>Week</button>
        </div>
      </div>

      {error && <p className="error-banner">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {mode === "month" ? (
        <MonthGrid
          days={range.days}
          anchor={anchor}
          selected={selected}
          onSelect={setSelected}
          entriesByDay={entriesByDay}
          holidaysByDay={holidaysByDay}
          timeOffByDay={timeOffByDay}
          pendingDays={pendingCorrectionDays}
          entryHHmm={entryHHmm}
        />
      ) : (
        <WeekList
          days={range.days}
          entriesByDay={entriesByDay}
          holidaysByDay={holidaysByDay}
          timeOffByDay={timeOffByDay}
          pendingDays={pendingCorrectionDays}
          weekTotal={weekTotal}
          selected={selected}
          onSelect={setSelected}
          entryHHmm={entryHHmm}
        />
      )}

      {selected && (
        <DayDetail
          day={selected}
          entries={entriesByDay.get(selected) ?? []}
          holiday={holidaysByDay.get(selected) ?? null}
          timeOff={timeOffByDay.get(selected) ?? null}
          entryHHmm={entryHHmm}
          onChange={openChange}
          onAdd={openAdd}
          onTimeOff={() => setModal({ kind: "timeoff", date: selected })}
        />
      )}

      {modal && (
        <Modal onClose={() => setModal(null)}>
          {modal.kind === "correction" ? (
            <CorrectionForm
              heading={modal.heading}
              subheading="This creates a correction request your manager reviews."
              hideIdentity
              initial={modal.initial}
              onCancel={() => setModal(null)}
              onSubmitted={() => {
                setModal(null);
                load();
              }}
            />
          ) : (
            <div className="card">
              <h1>Request time off</h1>
              <p className="muted">Your manager will review and approve it.</p>
              <PtoForm
                employeeName={profile.fullName}
                employeeEmail={profile.email}
                jibblePersonId={profile.jibblePersonId}
                initialStart={modal.date}
                initialEnd={modal.date}
                onSubmitted={load}
              />
              <button className="btn-secondary btn-inline" style={{ marginTop: "0.75rem" }} onClick={() => setModal(null)}>
                Close
              </button>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}

// ---- Month grid -----------------------------------------------------------
function MonthGrid(props: {
  days: Date[];
  anchor: Date;
  selected: string | null;
  onSelect: (d: string) => void;
  entriesByDay: Map<string, TimesheetEntryDTO[]>;
  holidaysByDay: Map<string, string>;
  timeOffByDay: Map<string, TimeOffDay>;
  pendingDays: Set<string>;
  entryHHmm: (e: TimesheetEntryDTO) => string;
}) {
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="cal-month">
      <div className="cal-dow-row">
        {dows.map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {props.days.map((d) => {
          const key = ymd(d);
          const entries = props.entriesByDay.get(key) ?? [];
          const holiday = props.holidaysByDay.get(key);
          const timeOff = props.timeOffByDay.get(key);
          const cls = [
            "cal-cell",
            sameMonth(d, props.anchor) ? "" : "cal-cell-out",
            isToday(d) ? "cal-cell-today" : "",
            props.selected === key ? "cal-cell-sel" : "",
          ].join(" ");
          return (
            <button key={key} className={cls} onClick={() => props.onSelect(key)}>
              <span className="cal-daynum">{d.getDate()}</span>
              {holiday && <span className="cal-chip chip-holiday" title={holiday}>★ {holiday}</span>}
              {timeOff && (
                <span className={`cal-chip ${timeOff.status === "pending" ? "chip-pto-pending" : "chip-pto"}`}>
                  {timeOff.ptoType}{timeOff.status === "pending" ? " (pending)" : ""}
                </span>
              )}
              {entries.slice(0, 3).map((e) => (
                <span key={e.id} className={`cal-punch ${isIn(e) ? "punch-in" : "punch-out"}`}>
                  {isIn(e) ? "▸" : "◂"} {props.entryHHmm(e)}
                </span>
              ))}
              {entries.length > 3 && <span className="cal-more">+{entries.length - 3} more</span>}
              {props.pendingDays.has(key) && <span className="cal-chip chip-pending">● pending</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Week list ------------------------------------------------------------
function WeekList(props: {
  days: Date[];
  entriesByDay: Map<string, TimesheetEntryDTO[]>;
  holidaysByDay: Map<string, string>;
  timeOffByDay: Map<string, TimeOffDay>;
  pendingDays: Set<string>;
  weekTotal: number;
  selected: string | null;
  onSelect: (d: string) => void;
  entryHHmm: (e: TimesheetEntryDTO) => string;
}) {
  return (
    <div className="cal-week">
      {props.days.map((d) => {
        const key = ymd(d);
        const entries = props.entriesByDay.get(key) ?? [];
        const holiday = props.holidaysByDay.get(key);
        const timeOff = props.timeOffByDay.get(key);
        const hours = dayHours(entries);
        return (
          <button
            key={key}
            className={`week-row ${props.selected === key ? "week-row-sel" : ""} ${isToday(d) ? "week-row-today" : ""}`}
            onClick={() => props.onSelect(key)}
          >
            <div className="week-day">
              <span className="week-dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="week-date">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </div>
            <div className="week-punches">
              {holiday && <span className="cal-chip chip-holiday">★ {holiday}</span>}
              {timeOff && (
                <span className={`cal-chip ${timeOff.status === "pending" ? "chip-pto-pending" : "chip-pto"}`}>
                  {timeOff.ptoType}{timeOff.status === "pending" ? " (pending)" : ""}
                </span>
              )}
              {entries.map((e) => (
                <span key={e.id} className={`cal-punch ${isIn(e) ? "punch-in" : "punch-out"}`}>
                  {isIn(e) ? "▸ in" : "◂ out"} {props.entryHHmm(e)}
                  {e.isLocked ? " 🔒" : ""}
                </span>
              ))}
              {entries.length === 0 && !holiday && !timeOff && <span className="muted">—</span>}
              {props.pendingDays.has(key) && <span className="cal-chip chip-pending">● pending</span>}
            </div>
            <div className="week-total">{fmtHours(hours)}</div>
          </button>
        );
      })}
      <div className="week-foot">
        <span>Week total</span>
        <strong>{fmtHours(props.weekTotal) || "0.00h"}</strong>
      </div>
    </div>
  );
}

// ---- Day detail panel -----------------------------------------------------
function DayDetail(props: {
  day: string;
  entries: TimesheetEntryDTO[];
  holiday: string | null;
  timeOff: TimeOffDay | null;
  entryHHmm: (e: TimesheetEntryDTO) => string;
  onChange: (e: TimesheetEntryDTO) => void;
  onAdd: (day: string, type: EventType) => void;
  onTimeOff: () => void;
}) {
  const nice = parseYmd(props.day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="day-detail">
      <h2 className="day-detail-title">{nice}</h2>
      {props.holiday && <p className="notice">★ {props.holiday} — paid holiday.</p>}
      {props.timeOff && (
        <p className="notice">
          {props.timeOff.ptoType} time off{props.timeOff.status === "pending" ? " (pending approval)" : " (approved)"}.
        </p>
      )}

      {props.entries.length === 0 ? (
        <p className="muted">No punches recorded this day.</p>
      ) : (
        <ul className="request-list">
          {props.entries.map((e) => (
            <li key={e.id} className="request-item entry-row">
              <div className="entry-main">
                <span className={`entry-type entry-${e.type.toLowerCase()}`}>{e.type}</span>
                <span className="entry-time">{props.entryHHmm(e)}</span>
                {e.isManual && <span className="badge badge-approved">manual</span>}
                {e.isLocked && <span className="badge badge-denied">locked</span>}
              </div>
              {e.isLocked ? (
                <span className="entry-locked" title="Locked pay period — can't be changed">🔒 Locked</span>
              ) : (
                <button className="btn-secondary btn-inline" onClick={() => props.onChange(e)}>
                  Request change
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="day-actions">
        <button className="btn-secondary btn-inline" onClick={() => props.onAdd(props.day, EventType.ClockIn)}>
          + Missing clock-in
        </button>
        <button className="btn-secondary btn-inline" onClick={() => props.onAdd(props.day, EventType.ClockOut)}>
          + Missing clock-out
        </button>
        <button className="btn-secondary btn-inline" onClick={props.onTimeOff}>
          Request time off
        </button>
      </div>
    </div>
  );
}

// ---- Modal ----------------------------------------------------------------
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

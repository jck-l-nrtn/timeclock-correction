import { useEffect, useMemo, useState } from "react";
import {
  EventType,
  payPeriodFor,
  stepPayPeriod,
  addDaysStr,
  type CorrectionRequestDTO,
  type HolidayDTO,
  type PayPeriod,
  type TimesheetEntryDTO,
} from "@timesheet/shared";
import {
  fetchHolidays,
  fetchMyRequests,
  fetchPayPeriod,
  fetchTimesheet,
  type EmployeeProfile,
  type PayPeriodDef,
} from "../api.js";
import {
  entryHHmm,
  fmtHM,
  fmtHoursNum,
  groupByDay,
  hoursFor,
  openPunch,
  pairSegments,
  parseYmd,
  todayYmd,
} from "../timeUtil.js";
import { CorrectionForm, type CorrectionFormInitial } from "./CorrectionForm.js";

const OT_WEEKLY = 40;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const niceRange = (a: string, b: string) =>
  `${parseYmd(a).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${parseYmd(b).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

type Modal =
  | { kind: "fix"; heading: string; initial: CorrectionFormInitial; original: { type: string; date: string; time: string } }
  | { kind: "add"; heading: string; initial: CorrectionFormInitial }
  | null;

export function TimesheetPage({ profile }: { profile: EmployeeProfile }) {
  const [def, setDef] = useState<PayPeriodDef | null>(null);
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<TimesheetEntryDTO[] | null>(null);
  const [today, setToday] = useState<TimesheetEntryDTO[]>([]);
  const [holidays, setHolidays] = useState<HolidayDTO[]>([]);
  const [requests, setRequests] = useState<CorrectionRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    Promise.all([
      fetchPayPeriod(),
      fetchTimesheet(todayYmd(), todayYmd()).catch(() => null),
      fetchHolidays().catch(() => []),
      fetchMyRequests().catch(() => []),
    ])
      .then(([d, t, hols, reqs]) => {
        setDef(d);
        setToday(t?.entries ?? []);
        setHolidays(hols);
        setRequests(reqs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const period: PayPeriod | null = useMemo(() => {
    if (!def) return null;
    const current = payPeriodFor(def, todayYmd());
    return offset === 0 ? current : stepPayPeriod(def, current, offset);
  }, [def, offset]);

  useEffect(() => {
    if (!period) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    fetchTimesheet(period.start, period.end)
      .then((t) => setEntries(t.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load timesheet"))
      .finally(() => setLoading(false));
  }, [period?.start, period?.end]);

  const byDay = useMemo(() => groupByDay(entries ?? []), [entries]);
  const holidayByDay = useMemo(() => new Map(holidays.map((h) => [h.date, h.name])), [holidays]);
  const pendingByDay = useMemo(() => {
    const s = new Set<string>();
    for (const r of requests) if (r.kind === "correction" && r.status === "pending" && r.date) s.add(r.date);
    return s;
  }, [requests]);

  const weeks = useMemo(() => {
    if (!period) return [];
    const out: { start: string; days: string[] }[] = [];
    for (let w = 0; w < Math.ceil(period.length / 7); w++) {
      const wStart = addDaysStr(period.start, w * 7);
      const days = Array.from({ length: 7 }, (_, i) => addDaysStr(wStart, i)).filter((d) => d <= period.end);
      out.push({ start: wStart, days });
    }
    return out;
  }, [period]);

  const periodHours = useMemo(() => hoursFor(entries ?? []), [entries]);
  const daysWorked = useMemo(() => [...byDay.values()].filter((l) => hoursFor(l) > 0).length, [byDay]);
  const open = openPunch(today);
  const todayHours = hoursFor(today);
  const isCurrent = offset === 0;

  // Modal openers
  const fix = (e: TimesheetEntryDTO) =>
    setModal({
      kind: "fix",
      heading: `Fix your ${e.type.toLowerCase()} punch`,
      original: { type: e.type, date: e.belongsToDate, time: entryHHmm(e) },
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
  const addShift = (day: string) =>
    setModal({
      kind: "add",
      heading: "Add a missing shift",
      initial: {
        employeeName: profile.fullName,
        employeeEmail: profile.email,
        jibblePersonId: profile.jibblePersonId ?? undefined,
        date: day,
      },
    });

  if (error) return <section className="card"><p className="error-banner">{error}</p></section>;
  if (!def || !period) return <section className="card"><p className="muted">Loading…</p></section>;

  return (
    <div className="ts-page">
      {/* Live status */}
      <div className={`clock-banner ${open ? "clock-on" : ""}`}>
        <div className="clock-dot" />
        <div className="clock-text">
          {open ? (
            <><strong>Clocked in</strong> since {entryHHmm(open)} · {fmtHM(todayHours)} today</>
          ) : todayHours > 0 ? (
            <><strong>Clocked out</strong> · {fmtHM(todayHours)} today</>
          ) : (
            <><strong>Not clocked in</strong> · no punches today</>
          )}
        </div>
        <span className="clock-date muted">{parseYmd(todayYmd()).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
      </div>

      {/* Period selector */}
      <div className="period-bar">
        <button className="btn-secondary btn-inline" onClick={() => setOffset((o) => o - 1)} aria-label="Previous period">←</button>
        <div className="period-label">
          <div className="period-range">{niceRange(period.start, period.end)}</div>
          <div className="muted period-name">{def.name}{isCurrent ? " · current" : ""}</div>
        </div>
        <button className="btn-secondary btn-inline" disabled={isCurrent} onClick={() => setOffset((o) => Math.min(0, o + 1))} aria-label="Next period">→</button>
        {!isCurrent && <button className="btn-link" onClick={() => setOffset(0)}>Today</button>}
      </div>

      {/* Stats */}
      <div className="stat-cards">
        <div className="stat-card stat-primary">
          <div className="stat-big">{fmtHoursNum(periodHours)}</div>
          <div className="stat-cap">hours this period</div>
        </div>
        <div className="stat-card">
          <div className="stat-big">{daysWorked}</div>
          <div className="stat-cap">days worked</div>
        </div>
        <div className="stat-card">
          <div className="stat-big">{fmtHoursNum(daysWorked ? periodHours / daysWorked : 0)}</div>
          <div className="stat-cap">avg hours / day</div>
        </div>
      </div>

      {loading && <p className="muted">Loading timesheet…</p>}

      {/* Pay-period calendar */}
      {!loading && weeks.map((week) => {
        const wHours = hoursFor(week.days.flatMap((d) => byDay.get(d) ?? []));
        const ot = wHours > OT_WEEKLY;
        return (
          <section className="pp-week" key={week.start}>
            <div className="pp-week-head">
              <span className="pp-week-label">Week of {parseYmd(week.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span className={`pp-week-hours ${ot ? "week-ot" : ""}`}>{fmtHoursNum(wHours)} h{ot ? " · OT" : ""}</span>
            </div>
            <div className="pp-grid">
              {week.days.map((d) => {
                const list = byDay.get(d) ?? [];
                const segs = pairSegments(list);
                const h = hoursFor(list);
                const dt = parseYmd(d);
                const holiday = holidayByDay.get(d);
                const cls = [
                  "pp-day",
                  d === todayYmd() ? "pp-today" : "",
                  selected === d ? "pp-sel" : "",
                  h === 0 && !holiday ? "pp-empty" : "",
                ].join(" ");
                return (
                  <button key={d} className={cls} onClick={() => setSelected(selected === d ? null : d)}>
                    <div className="pp-day-top">
                      <span className="pp-dow">{DOW[dt.getDay()]}</span>
                      <span className="pp-num">{dt.getDate()}</span>
                    </div>
                    <div className="pp-day-body">
                      {holiday && <span className="pp-tag tag-holiday">★ {holiday}</span>}
                      {segs.map((s, i) => (
                        <span key={i} className="pp-seg">{s.in}<span className="pp-dash">–</span>{s.out ?? <em>now</em>}</span>
                      ))}
                      {pendingByDay.has(d) && <span className="pp-tag tag-pending">● pending</span>}
                    </div>
                    {h > 0 && <div className="pp-day-hours">{fmtHoursNum(h)}h</div>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {!loading && (
        <div className="period-total">
          <span>Period total</span>
          <strong>{fmtHoursNum(periodHours)} hours</strong>
        </div>
      )}

      {/* Day detail / actions */}
      {selected && (
        <section className="card day-sheet">
          <div className="day-sheet-head">
            <h2>{parseYmd(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
            <button className="btn-link" onClick={() => setSelected(null)}>Close</button>
          </div>
          {holidayByDay.get(selected) && <p className="notice">★ {holidayByDay.get(selected)} — paid holiday.</p>}
          {(byDay.get(selected) ?? []).length === 0 ? (
            <p className="muted">No punches recorded this day.</p>
          ) : (
            <ul className="punch-list">
              {(byDay.get(selected) ?? []).map((e) => (
                <li key={e.id} className="punch-row">
                  <span className={`punch-pill punch-${e.type.toLowerCase()}`}>{e.type === "In" ? "Clock in" : "Clock out"}</span>
                  <span className="punch-time">{entryHHmm(e)}</span>
                  {e.isManual && <span className="badge badge-approved">manual</span>}
                  {e.isLocked ? (
                    <span className="punch-locked muted">🔒 locked</span>
                  ) : (
                    <button className="btn-link" onClick={() => fix(e)}>Fix</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="day-sheet-actions">
            <button className="btn-secondary btn-inline" onClick={() => addShift(selected)}>+ Add missing shift</button>
          </div>
        </section>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <CorrectionForm
              heading={modal.heading}
              subheading={
                modal.kind === "add"
                  ? "Add the full shift you worked — both clock-in and clock-out. Your manager reviews it."
                  : "Your manager reviews this; approved changes update your timesheet."
              }
              hideIdentity
              lockDate
              original={modal.kind === "fix" ? modal.original : undefined}
              initial={modal.initial}
              onCancel={() => setModal(null)}
              onSubmitted={() => {
                setModal(null);
                reloadAll();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  function reloadRequests() {
    fetchMyRequests().then(setRequests).catch(() => {});
  }
  function reloadAll() {
    reloadRequests();
    if (period) fetchTimesheet(period.start, period.end).then((t) => setEntries(t.entries)).catch(() => {});
  }
}

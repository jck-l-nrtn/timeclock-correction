import { useEffect, useMemo, useState } from "react";
import {
  payPeriodFor,
  stepPayPeriod,
  addDaysStr,
  type PayPeriod,
  type TimesheetEntryDTO,
} from "@timesheet/shared";
import {
  fetchMyPto,
  fetchPayPeriod,
  fetchTimesheet,
  type EmployeeProfile,
  type PayPeriodDef,
  type PtoBalanceDTO,
} from "../api.js";
import {
  fmtHM,
  fmtHoursNum,
  groupByDay,
  hoursFor,
  openPunch,
  pairSegments,
  parseYmd,
  todayYmd,
} from "../timeUtil.js";
import { TimesheetCalendar } from "./TimesheetCalendar.js";

const OT_WEEKLY = 40;
const niceDay = (ymd: string, opts?: Intl.DateTimeFormatOptions) =>
  parseYmd(ymd).toLocaleDateString(undefined, opts ?? { weekday: "short", month: "short", day: "numeric" });
const niceRange = (a: string, b: string) =>
  `${parseYmd(a).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${parseYmd(b).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

export function TimesheetPage({ profile }: { profile: EmployeeProfile }) {
  const [tab, setTab] = useState<"overview" | "calendar">("overview");
  return (
    <div>
      <div className="seg-control">
        <button className={tab === "overview" ? "seg seg-on" : "seg"} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={tab === "calendar" ? "seg seg-on" : "seg"} onClick={() => setTab("calendar")}>
          Calendar
        </button>
      </div>
      {tab === "overview" ? <Overview profile={profile} /> : <TimesheetCalendar profile={profile} />}
    </div>
  );
}

function Overview({ profile }: { profile: EmployeeProfile }) {
  const [def, setDef] = useState<PayPeriodDef | null>(null);
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<TimesheetEntryDTO[] | null>(null);
  const [today, setToday] = useState<TimesheetEntryDTO[]>([]);
  const [balances, setBalances] = useState<PtoBalanceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the pay-period definition + static bits once.
  useEffect(() => {
    Promise.all([fetchPayPeriod(), fetchMyPto().catch(() => []), fetchTimesheet(todayYmd(), todayYmd()).catch(() => null)])
      .then(([d, bals, t]) => {
        setDef(d);
        setBalances(bals);
        setToday(t?.entries ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const period: PayPeriod | null = useMemo(() => {
    if (!def) return null;
    const current = payPeriodFor(def, todayYmd());
    return offset === 0 ? current : stepPayPeriod(def, current, offset);
  }, [def, offset]);

  // Load the viewed period's entries.
  useEffect(() => {
    if (!period) return;
    setLoading(true);
    setError(null);
    fetchTimesheet(period.start, period.end)
      .then((t) => setEntries(t.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load timesheet"))
      .finally(() => setLoading(false));
  }, [period?.start, period?.end]);

  const byDay = useMemo(() => groupByDay(entries ?? []), [entries]);

  // Split the period into weeks (7-day chunks from the start).
  const weeks = useMemo(() => {
    if (!period) return [];
    const out: { start: string; end: string; days: string[] }[] = [];
    for (let w = 0; w < Math.ceil(period.length / 7); w++) {
      const wStart = addDaysStr(period.start, w * 7);
      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDaysStr(wStart, i);
        if (d <= period.end) days.push(d);
      }
      out.push({ start: wStart, end: days[days.length - 1], days });
    }
    return out;
  }, [period]);

  const periodHours = useMemo(() => hoursFor(entries ?? []), [entries]);
  const daysWorked = useMemo(
    () => [...byDay.values()].filter((list) => hoursFor(list) > 0).length,
    [byDay]
  );
  const topPto = useMemo(() => {
    const paid = balances.filter((b) => b.balance > 0);
    return paid.sort((a, b) => b.balance - a.balance)[0] ?? null;
  }, [balances]);

  const open = openPunch(today);
  const todayHours = hoursFor(today);
  const isCurrent = offset === 0;

  if (error) return <section className="card"><p className="error-banner">{error}</p></section>;
  if (!def || !period) return <section className="card"><p className="muted">Loading…</p></section>;

  return (
    <div>
      {/* Live status banner */}
      <div className={`clock-banner ${open ? "clock-on" : ""}`}>
        <div className="clock-dot" />
        <div className="clock-text">
          {open ? (
            <>
              <strong>Clocked in</strong> since {open.localTime ? open.localTime.split("T")[1].slice(0, 5) : ""} ·
              {" "}{fmtHM(todayHours)} today
            </>
          ) : todayHours > 0 ? (
            <>
              <strong>Clocked out</strong> · {fmtHM(todayHours)} today
            </>
          ) : (
            <><strong>Not clocked in</strong> · no punches today</>
          )}
        </div>
        <span className="clock-date muted">{niceDay(todayYmd(), { weekday: "long", month: "long", day: "numeric" })}</span>
      </div>

      {/* Period selector */}
      <div className="period-bar">
        <button className="btn-secondary btn-inline" onClick={() => setOffset((o) => o - 1)}>←</button>
        <div className="period-label">
          <div className="period-range">{niceRange(period.start, period.end)}</div>
          <div className="muted period-name">{def.name}{isCurrent ? " · current" : ""}</div>
        </div>
        <button className="btn-secondary btn-inline" disabled={isCurrent} onClick={() => setOffset((o) => Math.min(0, o + 1))}>→</button>
        {!isCurrent && (
          <button className="btn-link" onClick={() => setOffset(0)}>Today</button>
        )}
      </div>

      {/* Stat cards */}
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
          <div className="stat-big">{fmtHoursNum(period.length ? periodHours / Math.max(1, daysWorked) : 0)}</div>
          <div className="stat-cap">avg hours / day</div>
        </div>
        <div className="stat-card">
          <div className="stat-big">{topPto ? fmtHoursNum(topPto.balance) : "—"}</div>
          <div className="stat-cap">{topPto ? `${topPto.unit.toLowerCase().includes("hour") ? "hrs" : "days"} ${topPto.policyName}` : "PTO available"}</div>
        </div>
      </div>

      {loading && <p className="muted">Loading timesheet…</p>}

      {/* Weekly breakdown */}
      {!loading &&
        weeks.map((week) => {
          const weekHours = hoursFor(week.days.flatMap((d) => byDay.get(d) ?? []));
          const ot = weekHours > OT_WEEKLY;
          return (
            <section className="card week-card" key={week.start}>
              <div className="week-card-head">
                <h2>Week of {niceDay(week.start, { month: "short", day: "numeric" })}</h2>
                <span className={`week-hours ${ot ? "week-ot" : ""}`}>
                  {fmtHoursNum(weekHours)} h{ot ? " · OT" : ""}
                </span>
              </div>
              <div className="ts-table">
                {week.days.map((d) => {
                  const list = byDay.get(d) ?? [];
                  const segs = pairSegments(list);
                  const h = hoursFor(list);
                  const isToday = d === todayYmd();
                  return (
                    <div key={d} className={`ts-row ${isToday ? "ts-today" : ""} ${h === 0 ? "ts-empty" : ""}`}>
                      <div className="ts-day">{niceDay(d)}</div>
                      <div className="ts-segs">
                        {segs.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          segs.map((s, i) => (
                            <span key={i} className="ts-seg">
                              {s.in}<span className="ts-arrow">→</span>{s.out ?? <em>open</em>}
                            </span>
                          ))
                        )}
                      </div>
                      <div className="ts-hours">{h > 0 ? fmtHoursNum(h) : ""}</div>
                    </div>
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
    </div>
  );
}

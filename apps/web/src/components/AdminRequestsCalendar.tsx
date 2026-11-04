import { useMemo, useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import { addDays, parseYmd, startOfWeek, todayYmd, ymd } from "../timeUtil.js";
import { QueueItem, type DecideFn } from "./QueueItem.js";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

/** A request's relevant day(s): a correction's date, or a time-off span. */
function requestDays(r: CorrectionRequestDTO): string[] {
  if (r.kind === "timeoff" && r.startDate) {
    const days: string[] = [];
    let d = parseYmd(r.startDate);
    const end = parseYmd(r.endDate || r.startDate);
    while (d <= end) {
      days.push(ymd(d));
      d = addDays(d, 1);
    }
    return days;
  }
  return r.date ? [r.date] : [];
}

export function AdminRequestsCalendar({
  requests,
  onDecide,
}: {
  requests: CorrectionRequestDTO[];
  onDecide: DecideFn;
}) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, CorrectionRequestDTO[]>();
    for (const r of requests) {
      for (const d of requestDays(r)) {
        const list = m.get(d) ?? [];
        list.push(r);
        m.set(d, list);
      }
    }
    return m;
  }, [requests]);

  const days = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [anchor]);

  const step = (dir: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  const selectedRequests = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div>
      <div className="cal-head">
        <div className="cal-nav">
          <button className="btn-secondary btn-inline" onClick={() => step(-1)}>←</button>
          <button className="btn-secondary btn-inline" onClick={() => setAnchor(new Date())}>Today</button>
          <button className="btn-secondary btn-inline" onClick={() => step(1)}>→</button>
          <h2 className="cal-title">{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        </div>
        <span className="muted">{requests.length} pending</span>
      </div>

      <div className="cal-dow-row">
        {DOWS.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">
        {days.map((d) => {
          const key = ymd(d);
          const list = byDay.get(key) ?? [];
          const corrections = list.filter((r) => r.kind !== "timeoff").length;
          const timeoff = list.filter((r) => r.kind === "timeoff").length;
          const cls = [
            "cal-cell",
            sameMonth(d, anchor) ? "" : "cal-cell-out",
            key === todayYmd() ? "cal-cell-today" : "",
            selected === key ? "cal-cell-sel" : "",
          ].join(" ");
          return (
            <button key={key} className={cls} onClick={() => setSelected(key)}>
              <span className="cal-daynum">{d.getDate()}</span>
              {corrections > 0 && <span className="cal-chip chip-pending">{corrections} correction{corrections > 1 ? "s" : ""}</span>}
              {timeoff > 0 && <span className="cal-chip chip-pto-pending">{timeoff} time off</span>}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="day-detail">
          <h2 className="day-detail-title">
            {parseYmd(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          {selectedRequests.length === 0 ? (
            <p className="muted">No pending requests on this day.</p>
          ) : (
            <ul className="request-list">
              {selectedRequests.map((r) => (
                <QueueItem key={r.id} request={r} onDecide={onDecide} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

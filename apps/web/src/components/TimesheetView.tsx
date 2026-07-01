import { useCallback, useEffect, useMemo, useState } from "react";
import { EventType, type TimesheetDTO, type TimesheetEntryDTO } from "@timesheet/shared";
import { ApiError, fetchTimesheet } from "../api.js";
import { CorrectionForm, type CorrectionFormInitial } from "./CorrectionForm.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** "2026-06-01T08:06:00-06:00" -> "08:06" */
function hhmm(iso: string | null): string {
  if (!iso) return "";
  const t = iso.split("T")[1];
  return t ? t.slice(0, 5) : "";
}

interface ActiveForm {
  initial: CorrectionFormInitial;
  heading: string;
}

export function TimesheetView({ token }: { token?: string }) {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => isoDate(new Date(today.getTime() - 13 * 86400000)));
  const [to, setTo] = useState(() => isoDate(today));

  const [data, setData] = useState<TimesheetDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveForm | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchTimesheet(from, to, token)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load timesheet"))
      .finally(() => setLoading(false));
  }, [token, from, to]);

  useEffect(load, [load]);

  const days = useMemo(() => {
    const map = new Map<string, TimesheetEntryDTO[]>();
    for (const e of data?.entries ?? []) {
      const list = map.get(e.belongsToDate) ?? [];
      list.push(e);
      map.set(e.belongsToDate, list);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1)); // newest day first
  }, [data]);

  function openEdit(entry: TimesheetEntryDTO) {
    if (!data) return;
    setActive({
      heading: `Correct this ${entry.type} entry`,
      initial: {
        employeeName: data.person.fullName,
        employeeEmail: data.person.email,
        jibblePersonId: data.person.id,
        jibbleEntryId: entry.id,
        date: entry.belongsToDate,
        eventType: EventType.Adjustment,
        intendedTime: hhmm(entry.localTime ?? entry.timeUtc),
      },
    });
  }

  function openAdd(day: string) {
    if (!data) return;
    setActive({
      heading: "Add a missing entry",
      initial: {
        employeeName: data.person.fullName,
        employeeEmail: data.person.email,
        jibblePersonId: data.person.id,
        date: day,
        eventType: EventType.ClockIn,
      },
    });
  }

  if (active) {
    return (
      <CorrectionForm
        heading={active.heading}
        subheading="This creates a correction request for an admin to review."
        initial={active.initial}
        lockEmail
        onCancel={() => setActive(null)}
        onSubmitted={(dto) => {
          setActive(null);
          setFlash(`Request submitted — reference ${dto.id}. Track it under “My requests”.`);
        }}
      />
    );
  }

  return (
    <div className="card">
      <h1>My timesheet</h1>
      <p className="muted">Your Jibble entries. Select one to request a correction, or add a missing entry.</p>

      <div className="row range-row">
        <label className="field">
          <span className="field-label">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {flash && <p className="flash">{flash}</p>}
      {error && <p className="error-banner">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {data && !loading && days.length === 0 && (
        <p className="muted">No entries in this range.</p>
      )}

      {data &&
        !loading &&
        days.map(([day, entries]) => (
          <div key={day} className="day-group">
            <div className="day-header">
              <span className="day-date">{day}</span>
              <button className="btn-link" onClick={() => openAdd(day)}>
                + Add entry
              </button>
            </div>
            <ul className="request-list">
              {entries.map((e) => (
                <li key={e.id} className="request-item entry-row">
                  <div className="entry-main">
                    <span className={`entry-type entry-${e.type.toLowerCase()}`}>{e.type}</span>
                    <span className="entry-time">{hhmm(e.localTime ?? e.timeUtc)}</span>
                    {e.isManual && <span className="badge badge-approved">manual</span>}
                    {e.isLocked && <span className="badge badge-denied">locked</span>}
                  </div>
                  {e.isLocked ? (
                    <span
                      className="entry-locked"
                      title="Locked pay period — this entry can't be changed"
                    >
                      🔒 Locked
                    </span>
                  ) : (
                    <button className="btn-secondary btn-inline" onClick={() => openEdit(e)}>
                      Request change
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

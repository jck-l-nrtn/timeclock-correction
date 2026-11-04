import { useEffect, useState } from "react";
import type { HolidayDTO } from "../api.js";
import { fetchHolidays } from "../api.js";
import { PAID_HOLIDAYS } from "../hubConfig.js";

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function HolidaysView() {
  const [holidays, setHolidays] = useState<HolidayDTO[] | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchHolidays()
      .then((h) => {
        if (!active) return;
        if (h.length > 0) setHolidays(h);
        else {
          setHolidays(PAID_HOLIDAYS);
          setUsedFallback(true);
        }
      })
      .catch(() => {
        if (!active) return;
        setHolidays(PAID_HOLIDAYS);
        setUsedFallback(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const list = holidays ?? [];

  return (
    <section className="card">
      <h1>Paid Holidays</h1>
      <p className="muted">Days the shop is closed and paid.</p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="holiday-list">
          {list.map((h, i) => (
            <li key={i} className={h.date < today ? "h-past" : ""}>
              <span className="h-name">{h.name}</span>
              <span className="h-date">{fmt(h.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {usedFallback && !loading && (
        <p className="notice">Showing the standard holiday list.</p>
      )}
    </section>
  );
}

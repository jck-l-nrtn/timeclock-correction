import { PAID_HOLIDAYS } from "../hubConfig.js";

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function HolidaysView() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="card">
      <h1>Paid Holidays</h1>
      <p className="muted">Days the shop is closed and paid.</p>
      <ul className="holiday-list">
        {PAID_HOLIDAYS.map((h, i) => (
          <li key={i} className={h.date < today ? "h-past" : ""}>
            <span className="h-name">{h.name}</span>
            <span className="h-date">{fmt(h.date)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

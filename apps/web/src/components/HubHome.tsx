import { QUICK_LINKS } from "../hubConfig.js";
import type { EmployeeProfile } from "../api.js";

export type HubView = "timesheet" | "report" | "requests" | "timeoff" | "holidays" | "info";

const LINK_ICON: Record<string, string> = { Payroll: "💵", "Reimbursement form": "🧾" };

export function HubHome({
  profile,
  onNavigate,
}: {
  profile: EmployeeProfile;
  onNavigate: (v: HubView) => void;
}) {
  const first = profile.fullName.split(" ")[0] || "there";

  const cards: { icon: string; title: string; desc: string; view: HubView }[] = [
    { icon: "🕒", title: "My Timesheet", desc: "See your clock-ins and clock-outs", view: "timesheet" },
    { icon: "✏️", title: "Request a Correction", desc: "Fix a missed or wrong timeclock entry", view: "report" },
    { icon: "🌴", title: "Time Off", desc: "Your PTO balance and time-off requests", view: "timeoff" },
    { icon: "📋", title: "My Requests", desc: "Track your correction & time-off requests", view: "requests" },
    { icon: "📅", title: "Paid Holidays", desc: "Company holiday schedule", view: "holidays" },
    { icon: "👤", title: "My Info", desc: "Your employee details", view: "info" },
  ];

  return (
    <div>
      <div className="hub-hero">
        <h1>Welcome, {first}</h1>
        <p>Your Montane Packaging employee hub.</p>
      </div>

      <div className="hub-grid">
        {cards.map((c) => (
          <button key={c.title} className="hub-card" onClick={() => onNavigate(c.view)}>
            <span className="icon">{c.icon}</span>
            <span className="hub-title">{c.title}</span>
            <span className="hub-desc">{c.desc}</span>
          </button>
        ))}

        {QUICK_LINKS.map((l) =>
          l.url ? (
            <a key={l.label} className="hub-card external" href={l.url} target="_blank" rel="noopener noreferrer">
              <span className="icon">{LINK_ICON[l.label] ?? "🔗"}</span>
              <span className="hub-title">{l.label}</span>
              <span className="hub-desc">{l.desc}</span>
            </a>
          ) : (
            <div key={l.label} className="hub-card" style={{ opacity: 0.6, cursor: "default" }}>
              <span className="icon">{LINK_ICON[l.label] ?? "🔗"}</span>
              <span className="hub-title">{l.label}</span>
              <span className="hub-desc">Link not set yet — ask your admin.</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

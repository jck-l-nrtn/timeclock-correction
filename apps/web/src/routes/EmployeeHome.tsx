import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { employeeLogout, employeeMe, type EmployeeProfile } from "../api.js";
import { EmployeeAuth } from "../components/EmployeeAuth.js";
import { TimesheetPage } from "../components/TimesheetPage.js";
import { RequestList } from "../components/RequestList.js";
import { HubHome, type HubView } from "../components/HubHome.js";
import { HolidaysView } from "../components/HolidaysView.js";
import { EmployeeInfo } from "../components/EmployeeInfo.js";
import { TimeOffView } from "../components/TimeOffView.js";

/**
 * Employee hub. A valid Google session shows the full hub; otherwise the sign-in.
 */
export function EmployeeHome() {
  const [me, setMe] = useState<EmployeeProfile | null | undefined>(undefined);

  useEffect(() => {
    employeeMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) {
    return (
      <section className="card">
        <p className="muted">Loading…</p>
      </section>
    );
  }
  if (!me) return <EmployeeAuth />;
  return <Hub profile={me} onSignOut={() => setMe(null)} />;
}

/** Full logged-in hub. */
function Hub({ profile, onSignOut }: { profile: EmployeeProfile; onSignOut: () => void }) {
  const [view, setView] = useState<"home" | HubView>("home");

  return (
    <div>
      <div className="dashboard-head">
        {view === "home" ? (
          <span />
        ) : (
          <button className="back-link" onClick={() => setView("home")}>
            ← Hub
          </button>
        )}
        <div className="admin-user">
          <span className="muted">{profile.fullName}</span>
          {profile.isAdmin && (
            <Link className="btn-secondary btn-inline" to="/admin">
              Admin console
            </Link>
          )}
          <button
            className="btn-secondary btn-inline"
            onClick={async () => {
              await employeeLogout();
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {view === "home" && <HubHome profile={profile} onNavigate={setView} />}
      {(view === "timesheet" || view === "report") && <TimesheetPage profile={profile} />}
      {view === "requests" && <RequestList />}
      {view === "timeoff" && <TimeOffView profile={profile} />}
      {view === "holidays" && <HolidaysView />}
      {view === "info" && <EmployeeInfo profile={profile} />}
    </div>
  );
}

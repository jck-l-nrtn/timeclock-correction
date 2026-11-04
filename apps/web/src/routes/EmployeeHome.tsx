import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { employeeLogout, employeeMe, type EmployeeProfile } from "../api.js";
import { EmployeeAuth } from "../components/EmployeeAuth.js";
import { TimesheetView } from "../components/TimesheetView.js";
import { RequestList } from "../components/RequestList.js";
import { CorrectionForm } from "../components/CorrectionForm.js";
import { HubHome, type HubView } from "../components/HubHome.js";
import { HolidaysView } from "../components/HolidaysView.js";
import { EmployeeInfo } from "../components/EmployeeInfo.js";
import { TimeOffView } from "../components/TimeOffView.js";

/**
 * Employee hub. Priority:
 *   1. ?token=... in the URL  -> magic-link fallback (timesheet + requests).
 *   2. a logged-in session    -> the full hub.
 *   3. otherwise              -> sign in.
 */
export function EmployeeHome() {
  const [params] = useSearchParams();
  const token = params.get("token") || undefined;
  const [me, setMe] = useState<EmployeeProfile | null | undefined>(undefined);

  useEffect(() => {
    if (token) {
      setMe(null);
      return;
    }
    employeeMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, [token]);

  if (token) return <TokenDashboard token={token} />;
  if (me === undefined) {
    return (
      <section className="card">
        <p className="muted">Loading…</p>
      </section>
    );
  }
  if (!me) return <EmployeeAuth onAuthed={setMe} />;
  return <Hub profile={me} onSignOut={() => setMe(null)} />;
}

/** Full logged-in hub. */
function Hub({ profile, onSignOut }: { profile: EmployeeProfile; onSignOut: () => void }) {
  const [view, setView] = useState<"home" | HubView>("home");

  const signOut = (
    <button
      className="btn-secondary btn-inline"
      onClick={async () => {
        await employeeLogout();
        onSignOut();
      }}
    >
      Sign out
    </button>
  );

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
          {signOut}
        </div>
      </div>

      {view === "home" && <HubHome profile={profile} onNavigate={setView} />}
      {view === "timesheet" && <TimesheetView />}
      {view === "requests" && <RequestList />}
      {view === "timeoff" && <TimeOffView />}
      {view === "holidays" && <HolidaysView />}
      {view === "info" && <EmployeeInfo profile={profile} />}
      {view === "report" && (
        <CorrectionForm
          heading="Request a timeclock correction"
          subheading="Missed a clock-in/out or need a time fixed? Submit it here."
          hideIdentity
          initial={{
            employeeName: profile.fullName,
            employeeEmail: profile.email,
            jibblePersonId: profile.jibblePersonId ?? undefined,
          }}
        />
      )}
    </div>
  );
}

/** Magic-link fallback — limited to timesheet + requests. */
function TokenDashboard({ token }: { token: string }) {
  const [tab, setTab] = useState<"timesheet" | "requests">("timesheet");
  return (
    <div>
      <div className="tabs">
        <button className={tab === "timesheet" ? "tab tab-active" : "tab"} onClick={() => setTab("timesheet")}>
          My timesheet
        </button>
        <button className={tab === "requests" ? "tab tab-active" : "tab"} onClick={() => setTab("requests")}>
          My requests
        </button>
      </div>
      {tab === "timesheet" ? <TimesheetView token={token} /> : <RequestList token={token} />}
    </div>
  );
}

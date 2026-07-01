import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { employeeLogout, employeeMe, type EmployeeProfile } from "../api.js";
import { EmployeeAuth } from "../components/EmployeeAuth.js";
import { TimesheetView } from "../components/TimesheetView.js";
import { RequestList } from "../components/RequestList.js";
import { CorrectionForm } from "../components/CorrectionForm.js";

type Tab = "timesheet" | "requests" | "report";

/**
 * Employee home. Priority:
 *   1. ?token=... in the URL  -> magic-link fallback (timesheet + requests).
 *   2. a logged-in session    -> full dashboard (timesheet, requests, report).
 *   3. otherwise               -> sign in / create account.
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

  if (token) return <Dashboard token={token} />;
  if (me === undefined) {
    return (
      <section className="card">
        <p className="muted">Loading…</p>
      </section>
    );
  }
  if (!me) return <EmployeeAuth onAuthed={setMe} />;
  return <Dashboard profile={me} onSignOut={() => setMe(null)} />;
}

function Dashboard({
  profile,
  token,
  onSignOut,
}: {
  profile?: EmployeeProfile;
  token?: string;
  onSignOut?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("timesheet");

  return (
    <div>
      <div className="dashboard-head">
        <div className="tabs">
          <button className={tab === "timesheet" ? "tab tab-active" : "tab"} onClick={() => setTab("timesheet")}>
            My timesheet
          </button>
          <button className={tab === "requests" ? "tab tab-active" : "tab"} onClick={() => setTab("requests")}>
            My requests
          </button>
          {profile && (
            <button className={tab === "report" ? "tab tab-active" : "tab"} onClick={() => setTab("report")}>
              Report an issue
            </button>
          )}
        </div>
        {profile && (
          <div className="admin-user">
            <span className="muted">{profile.fullName}</span>
            <button
              className="btn-secondary btn-inline"
              onClick={async () => {
                await employeeLogout();
                onSignOut?.();
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {tab === "timesheet" && <TimesheetView token={token} />}
      {tab === "requests" && <RequestList token={token} />}
      {tab === "report" && profile && (
        <CorrectionForm
          heading="Report an issue"
          subheading="Can't find the entry on your timesheet? Submit a correction here."
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

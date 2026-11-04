import { useCallback, useEffect, useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import {
  masterLogin,
  adminLogout,
  adminMe,
  fetchAdminLog,
  fetchAdminQueue,
  startGoogleLogin,
  submitDecision,
  type AdminSession,
} from "../api.js";
import { AdminUsers } from "../components/AdminUsers.js";
import { OrgPeople } from "../components/OrgPeople.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { BrandHero } from "../components/Brand.js";
import { GoogleButton } from "../components/GoogleButton.js";
import { QueueItem } from "../components/QueueItem.js";
import { AdminRequestsCalendar } from "../components/AdminRequestsCalendar.js";
import { PtoAccrual } from "../components/PtoAccrual.js";
import { AdminEmployees } from "../components/AdminEmployees.js";
import { summarizeRequest } from "../labels.js";

/**
 * Admin dashboard. Gate on session:
 *   - loading (undefined) -> spinner
 *   - null                -> dev-login form
 *   - AdminSession        -> review queue
 */
export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);

  useEffect(() => {
    adminMe()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  if (session === undefined) {
    return (
      <section className="card">
        <h1>Admin</h1>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (!session) return <AdminLogin onLogin={setSession} />;

  return <AdminShell session={session} onSignOut={() => setSession(null)} />;
}

const LOGIN_ERRORS: Record<string, string> = {
  not_recognized: "That Google account isn't set up here. Ask the master admin to add you.",
  forbidden: "That account doesn't have admin access.",
  email_unverified: "Your Google email isn't verified.",
  sso_not_configured: "Google sign-in isn't configured yet.",
  google_denied: "Google sign-in was cancelled.",
  bad_state: "Your sign-in session expired. Please try again.",
  sso_failed: "Something went wrong signing in. Please try again.",
};

function AdminLogin({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [showMaster, setShowMaster] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ssoErr = new URLSearchParams(window.location.search).get("login_error");

  async function handleMaster(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onLogin(await masterLogin(email.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card auth-card">
      <BrandHero subtitle="Admin Console" />
      <h1>Admin sign in</h1>
      <p className="muted">Sign in with your Google account. Admin access is granted by the master admin.</p>
      {ssoErr && <p className="error-banner">{LOGIN_ERRORS[ssoErr] ?? "Sign-in failed. Please try again."}</p>}
      <GoogleButton label="Sign in with Google" onClick={() => startGoogleLogin("admin")} />

      <div className="master-login">
        {!showMaster ? (
          <button className="btn-link" onClick={() => setShowMaster(true)}>
            Master admin sign in
          </button>
        ) : (
          <form onSubmit={handleMaster} noValidate>
            <p className="muted" style={{ marginTop: "1rem" }}>Break-glass master admin only.</p>
            <label className="field">
              <span className="field-label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <p className="error-banner">{error}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

type AdminTab = "timeclock" | "timeoff" | "employees" | "org" | "users";
const NAV: { id: AdminTab; label: string }[] = [
  { id: "timeclock", label: "Timeclock" },
  { id: "timeoff", label: "Time off" },
  { id: "employees", label: "Employees" },
  { id: "org", label: "Org chart" },
  { id: "users", label: "Add people" },
];

function AdminShell({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const [tab, setTab] = useState<AdminTab>("timeclock");
  const initials = (session.name || "A").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="admin-brand">
          <span className="admin-mark" />
          <div>
            <div className="admin-title">Admin Console</div>
            <div className="muted admin-sub">Montane Packaging</div>
          </div>
        </div>
        <div className="admin-user">
          <span className="admin-avatar" title={session.name}>{initials}</span>
          <span className="muted admin-name">{session.name}</span>
          <button
            className="btn-secondary btn-inline"
            onClick={async () => {
              await adminLogout();
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="admin-nav seg-control">
        {NAV.filter((n) => session.isMaster || (n.id !== "org" && n.id !== "users")).map((n) => (
          <button key={n.id} className={tab === n.id ? "seg seg-on" : "seg"} onClick={() => setTab(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>

      {tab === "timeclock" && <AdminQueue kind="correction" />}
      {tab === "timeoff" && (
        <>
          {session.isMaster && (
            <>
              <PtoAccrual />
              <div style={{ height: "1.25rem" }} />
            </>
          )}
          <AdminQueue kind="timeoff" />
        </>
      )}
      {tab === "employees" && <AdminEmployees />}
      {tab === "org" && <OrgPeople />}
      {tab === "users" && <AdminUsers />}
    </div>
  );
}

function AdminQueue({ kind }: { kind: "correction" | "timeoff" }) {
  const isTimeoff = kind === "timeoff";
  const ofKind = useCallback(
    (rs: CorrectionRequestDTO[]) => rs.filter((r) => (isTimeoff ? r.kind === "timeoff" : r.kind !== "timeoff")),
    [isTimeoff]
  );
  const [pending, setPending] = useState<CorrectionRequestDTO[] | null>(null);
  const [history, setHistory] = useState<CorrectionRequestDTO[] | null>(null);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [display, setDisplay] = useState<"calendar" | "list">(isTimeoff ? "list" : "calendar");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadPending = useCallback(() => {
    fetchAdminQueue("pending")
      .then((rs) => setPending(ofKind(rs)))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load queue"));
  }, [ofKind]);
  useEffect(loadPending, [loadPending]);

  function openHistory() {
    setView("history");
    if (!history) fetchAdminLog().then((rs) => setHistory(ofKind(rs))).catch(() => setHistory([]));
  }

  async function decide(req: CorrectionRequestDTO, decision: "approved" | "denied", note: string) {
    setError(null);
    try {
      const updated = await submitDecision(req.id, decision, note.trim() || undefined);
      setPending((q) => (q ? q.filter((r) => r.id !== req.id) : q));
      setHistory(null); // force refresh next time History opens
      setFlash(
        `${req.employeeName}'s request was ${decision}` +
          (updated.jibbleResult ? ` — ${updated.jibbleResult}` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  const title = isTimeoff ? "Time off" : "Timeclock";
  const count = pending?.length ?? null;

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h1 className="admin-section-title">{title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {count === null ? "Loading…" : count === 0 ? "Nothing waiting for review." : `${count} pending ${isTimeoff ? "time-off request" : "correction"}${count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="seg-control seg-sm" style={{ margin: 0 }}>
          <button className={view === "pending" ? "seg seg-on" : "seg"} onClick={() => setView("pending")}>
            Pending{count ? ` (${count})` : ""}
          </button>
          <button className={view === "history" ? "seg seg-on" : "seg"} onClick={openHistory}>History</button>
        </div>
      </div>

      {flash && <p className="flash">{flash}</p>}
      {error && <p className="error-banner">{error}</p>}

      {view === "pending" ? (
        <section className="card">
          <div className="cal-head">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Review</h2>
            <div className="seg-control seg-sm" style={{ margin: 0 }}>
              <button className={display === "calendar" ? "seg seg-on" : "seg"} onClick={() => setDisplay("calendar")}>Calendar</button>
              <button className={display === "list" ? "seg seg-on" : "seg"} onClick={() => setDisplay("list")}>List</button>
            </div>
          </div>
          {!pending && <p className="muted">Loading…</p>}
          {pending && pending.length === 0 && <p className="muted">No pending {isTimeoff ? "time-off requests" : "corrections"}. 🎉</p>}
          {pending && pending.length > 0 && display === "list" && (
            <ul className="request-list">
              {pending.map((r) => <QueueItem key={r.id} request={r} onDecide={decide} />)}
            </ul>
          )}
          {pending && pending.length > 0 && display === "calendar" && (
            <AdminRequestsCalendar requests={pending} onDecide={decide} />
          )}
        </section>
      ) : (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Decision history</h2>
          {!history && <p className="muted">Loading…</p>}
          {history && history.length === 0 && <p className="muted">No decisions yet.</p>}
          {history && history.length > 0 && (
            <ul className="request-list">
              {history.map((r) => (
                <li key={r.id} className="review-card hist-card">
                  <div className="review-head">
                    <div className="review-who">
                      <span className="review-name">{r.employeeName}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <span className="muted review-sub">{r.decidedAt ? new Date(r.decidedAt).toLocaleDateString() : ""}</span>
                  </div>
                  <div className="review-change">{summarizeRequest(r)}</div>
                  {r.decidedBy && <div className="muted review-email">by {r.decidedBy}{r.decisionNote ? ` · “${r.decisionNote}”` : ""}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

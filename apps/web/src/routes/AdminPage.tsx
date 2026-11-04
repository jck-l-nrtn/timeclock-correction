import { useCallback, useEffect, useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import {
  masterLogin,
  adminLogout,
  adminMe,
  fetchAdminQueue,
  startGoogleLogin,
  submitDecision,
  type AdminSession,
} from "../api.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { AdminUsers } from "../components/AdminUsers.js";
import { OrgPeople } from "../components/OrgPeople.js";
import { AdminLog } from "../components/AdminLog.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { BrandHero } from "../components/Brand.js";
import { GoogleButton } from "../components/GoogleButton.js";
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

function AdminShell({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const [tab, setTab] = useState<"queue" | "log" | "org" | "users">("queue");
  return (
    <div>
      <div className="dashboard-head">
        <div className="tabs">
          <button className={tab === "queue" ? "tab tab-active" : "tab"} onClick={() => setTab("queue")}>
            Review queue
          </button>
          <button className={tab === "log" ? "tab tab-active" : "tab"} onClick={() => setTab("log")}>
            Decision log
          </button>
          <button className={tab === "org" ? "tab tab-active" : "tab"} onClick={() => setTab("org")}>
            Org chart
          </button>
          <button className={tab === "users" ? "tab tab-active" : "tab"} onClick={() => setTab("users")}>
            Add people
          </button>
        </div>
        <div className="admin-user">
          <span className="muted">{session.name}</span>
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
      </div>
      {tab === "queue" && <AdminQueue />}
      {tab === "log" && <AdminLog />}
      {tab === "org" && <OrgPeople />}
      {tab === "users" && <AdminUsers />}
    </div>
  );
}

function AdminQueue() {
  const [queue, setQueue] = useState<CorrectionRequestDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchAdminQueue("pending")
      .then(setQueue)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load queue"));
  }, []);

  useEffect(load, [load]);

  async function decide(req: CorrectionRequestDTO, decision: "approved" | "denied", note: string) {
    setError(null);
    try {
      const updated = await submitDecision(req.id, decision, note.trim() || undefined);
      // Remove from the pending queue and surface the outcome.
      setQueue((q) => (q ? q.filter((r) => r.id !== req.id) : q));
      setFlash(
        `${req.employeeName}'s request was ${decision}` +
          (updated.jibbleResult ? ` — ${updated.jibbleResult}` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <section className="card">
      <h1>Review queue</h1>

      {flash && <p className="flash">{flash}</p>}
      {error && <p className="error-banner">{error}</p>}

      {!queue && <p className="muted">Loading…</p>}
      {queue && queue.length === 0 && <p className="muted">No pending requests. 🎉</p>}

      {queue && queue.length > 0 && (
        <ul className="request-list">
          {queue.map((r) => (
            <QueueItem key={r.id} request={r} onDecide={decide} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueItem({
  request,
  onDecide,
}: {
  request: CorrectionRequestDTO;
  onDecide: (r: CorrectionRequestDTO, d: "approved" | "denied", note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<"approved" | "denied" | null>(null);

  async function confirmDecision() {
    if (!pending) return;
    setBusy(true);
    await onDecide(request, pending, note);
    setBusy(false);
    setPending(null);
  }

  const changeLabel = summarizeRequest(request);

  return (
    <li className="request-item queue-item">
      <div className="request-main">
        <div className="request-title">
          {request.employeeName}
          {request.kind === "timeoff" ? " · Time off" : ""}
        </div>
        <div className="muted">
          {summarizeRequest(request)} · {request.employeeEmail}
        </div>
        <div className="request-reason muted">“{request.reason}”</div>
        {request.kind !== "timeoff" && request.affirmed && (
          <div className="muted request-affirm">✓ Employee affirmed the information is correct</div>
        )}
        <textarea
          rows={2}
          className="note-input"
          placeholder="Note (optional) — shown to the employee"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="queue-actions">
          <button className="btn-primary" disabled={busy} onClick={() => setPending("approved")}>
            Approve
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => setPending("denied")}>
            Deny
          </button>
        </div>
      </div>
      <StatusBadge status={request.status} />

      {pending && (
        <ConfirmDialog
          title={pending === "approved" ? "Approve request?" : "Deny request?"}
          message={
            `${request.employeeName}: ${changeLabel}.` +
            (pending === "approved"
              ? " This will apply the correction to Jibble."
              : " The employee will see it was denied.") +
            (note.trim() ? ` Note: “${note.trim()}”.` : "")
          }
          confirmLabel={pending === "approved" ? "Approve" : "Deny"}
          danger={pending === "denied"}
          busy={busy}
          onConfirm={confirmDecision}
          onCancel={() => setPending(null)}
        />
      )}
    </li>
  );
}

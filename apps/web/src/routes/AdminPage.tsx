import { useCallback, useEffect, useState } from "react";
import type { CorrectionRequestDTO } from "@timesheet/shared";
import {
  adminLogin,
  adminLogout,
  adminMe,
  fetchAdminQueue,
  submitDecision,
  type AdminSession,
} from "../api.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { AdminUsers } from "../components/AdminUsers.js";
import { AdminLog } from "../components/AdminLog.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { BrandHero } from "../components/Brand.js";
import { labelForEvent } from "../labels.js";

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

function AdminLogin({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onLogin(await adminLogin(email.trim(), pin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <BrandHero subtitle="Admin · Timeclock Corrections" />
      <h1>Admin sign in</h1>
      <p className="muted">
        Timeclock admins: sign in with your Jibble email and kiosk PIN. Only Jibble
        Admins and Owners can access this dashboard.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Jibble email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="field">
          <span className="field-label">Kiosk PIN</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error-banner">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function AdminShell({ session, onSignOut }: { session: AdminSession; onSignOut: () => void }) {
  const [tab, setTab] = useState<"queue" | "log" | "users">("queue");
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
          <button className={tab === "users" ? "tab tab-active" : "tab"} onClick={() => setTab("users")}>
            Users
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

  const changeLabel = `${labelForEvent(request.eventType)} on ${request.date} at ${request.intendedTime}`;

  return (
    <li className="request-item queue-item">
      <div className="request-main">
        <div className="request-title">
          {request.employeeName} · {labelForEvent(request.eventType)}
        </div>
        <div className="muted">
          {request.date} at {request.intendedTime} · {request.employeeEmail}
        </div>
        <div className="request-reason muted">“{request.reason}”</div>
        {request.affirmed && (
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

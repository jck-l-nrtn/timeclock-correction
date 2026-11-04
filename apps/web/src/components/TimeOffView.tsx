export function TimeOffView() {
  return (
    <section className="card">
      <h1>Time Off</h1>
      <p className="muted">Your paid time off at a glance.</p>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-num">—</div>
          <div className="stat-label">Available PTO</div>
        </div>
        <div className="stat">
          <div className="stat-num">—</div>
          <div className="stat-label">Used this year</div>
        </div>
        <div className="stat">
          <div className="stat-num">—</div>
          <div className="stat-label">Pending requests</div>
        </div>
      </div>

      <p className="notice">
        Your PTO balance loads from Jibble once the connection is refreshed. Submitting time-off
        requests here is coming next — we'll wire it to route to your manager (and optionally into
        Jibble) once we confirm how you'd like it handled.
      </p>
    </section>
  );
}

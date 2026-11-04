import { startGoogleLogin } from "../api.js";
import { BrandHero } from "./Brand.js";
import { GoogleButton } from "./GoogleButton.js";

const LOGIN_ERRORS: Record<string, string> = {
  not_recognized:
    "We couldn't find you in the system yet. Ask your manager to add you, then try again.",
  account_disabled: "This account has been archived. Contact your admin.",
  email_unverified: "Your Google email isn't verified. Verify it with Google and try again.",
  sso_not_configured: "Google sign-in isn't set up yet. Please contact your admin.",
  google_denied: "Google sign-in was cancelled.",
  bad_state: "Your sign-in session expired. Please try again.",
  sso_failed: "Something went wrong signing in. Please try again.",
};

/**
 * Employee sign-in — Google SSO only. Accounts are auto-created on first sign-in
 * for anyone in the Jibble org (or added manually by an admin).
 */
export function EmployeeAuth() {
  const err = new URLSearchParams(window.location.search).get("login_error");
  return (
    <section className="card auth-card">
      <BrandHero subtitle="Employee Hub" />
      <h1>Sign in</h1>
      <p className="muted">Sign in with your Google account to view your timesheet and requests.</p>
      {err && <p className="error-banner">{LOGIN_ERRORS[err] ?? "Sign-in failed. Please try again."}</p>}
      <GoogleButton onClick={() => startGoogleLogin("employee")} />
    </section>
  );
}

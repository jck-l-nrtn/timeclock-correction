import { Router } from "express";
import { randomBytes } from "node:crypto";
import { config, isProd } from "../config.js";
import { issueSession, isMaster } from "../services/session.js";
import { getPersonByEmail, upsertPerson } from "../db/data.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const googleAuthRouter = Router();

const STATE_COOKIE = "oauth_state";
const INTENT_COOKIE = "oauth_intent";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const redirectUri = () => `${config.google.redirectBase.replace(/\/$/, "")}/api/auth/google/callback`;
const appUrl = (path: string) => `${config.webOrigin.replace(/\/$/, "")}${path}`;

/**
 * GET /api/auth/google/start?intent=employee|admin
 * Begin the Google sign-in. Sets a short-lived signed-ish state cookie (double
 * submit) and redirects to Google's consent screen.
 */
googleAuthRouter.get("/start", (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.redirect(appUrl("/?login_error=sso_not_configured"));
  }
  const intent = req.query.intent === "admin" ? "admin" : "employee";
  const state = randomBytes(24).toString("base64url");
  const cookieOpts = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isProd,
    maxAge: 10 * 60 * 1000,
    path: "/api/auth/google",
  };
  res.cookie(STATE_COOKIE, state, cookieOpts);
  res.cookie(INTENT_COOKIE, intent, cookieOpts);

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return res.redirect(`${AUTH_URL}?${params.toString()}`);
});

/**
 * GET /api/auth/google/callback
 * Verify state, exchange the code, read the Google email, then sign the person
 * in: existing Person → session; else a Jibble-known email → auto-provision +
 * session; else "not recognized".
 */
googleAuthRouter.get("/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string; error?: string };
  if (req.query.error) return res.redirect(appUrl("/?login_error=google_denied"));

  const cookieState = req.cookies?.[STATE_COOKIE];
  const intent = req.cookies?.[INTENT_COOKIE] === "admin" ? "admin" : "employee";
  res.clearCookie(STATE_COOKIE, { path: "/api/auth/google" });
  res.clearCookie(INTENT_COOKIE, { path: "/api/auth/google" });
  if (!code || !state || !cookieState || state !== cookieState) {
    return res.redirect(appUrl("/?login_error=bad_state"));
  }

  try {
    // 1. Exchange the authorization code for tokens.
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) throw new Error("no access token");

    // 2. Read the verified Google profile.
    const infoRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!infoRes.ok) throw new Error(`userinfo failed (${infoRes.status})`);
    const info = (await infoRes.json()) as {
      email?: string;
      email_verified?: boolean | string;
      name?: string;
    };
    const email = info.email?.trim().toLowerCase();
    const verified = info.email_verified === true || info.email_verified === "true";
    if (!email || !verified) return res.redirect(appUrl("/?login_error=email_unverified"));

    // 3. Resolve identity.
    let person = isMaster(email) ? null : await getPersonByEmail(email);
    if (!person && !isMaster(email)) {
      // Auto-provision if this email belongs to someone in the Jibble org.
      const jibble = await jibbleClient.findPersonByEmail(email).catch(() => null);
      if (jibble) {
        person = await upsertPerson({
          email,
          fullName: jibble.fullName || info.name || email,
          jibblePersonId: jibble.id,
          timeZone: jibble.timeZone ?? null,
        });
      }
    }
    if (!person && !isMaster(email)) {
      return res.redirect(appUrl("/?login_error=not_recognized"));
    }

    // 4. Issue the unified session and land them on the right surface.
    issueSession(res, email);
    const isAdmin = isMaster(email) || Boolean(person?.isAdmin);
    const dest = intent === "admin" && isAdmin ? "/admin" : "/";
    return res.redirect(appUrl(dest));
  } catch (err) {
    console.error("[google-auth] callback failed:", err);
    return res.redirect(appUrl("/?login_error=sso_failed"));
  }
});

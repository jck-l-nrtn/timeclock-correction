import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config, isProd } from "../config.js";
import { clearSession, issueSession, currentPerson, isMaster } from "../services/session.js";
import { upsertPerson } from "../db/data.js";

export const authRouter = Router();

/**
 * POST /api/auth/dev-login { email, fullName?, isAdmin?, jibblePersonId? }
 * Local/dev + test only (DEV_LOGIN_ENABLED && !production). Provisions a Person
 * and issues a session without Google — never available in production.
 */
if (config.auth.devLoginEnabled && !isProd) {
  authRouter.post("/dev-login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
    if (!email) return res.status(400).json({ error: "email_required" });
    const person = await upsertPerson({
      email,
      fullName: typeof req.body?.fullName === "string" ? req.body.fullName : email,
      isAdmin: req.body?.isAdmin === true,
      jibblePersonId: typeof req.body?.jibblePersonId === "string" ? req.body.jibblePersonId : null,
      managerEmail: typeof req.body?.managerEmail === "string" ? req.body.managerEmail : null,
    });
    issueSession(res, person.email);
    return res.json({ ok: true, email: person.email, isAdmin: Boolean(person.isAdmin) });
  });
}

const MasterLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * POST /api/auth/master-login
 * Break-glass, non-SSO login for the single master admin (env-configured). Used
 * when Google is unavailable or someone is locked out. Everyone else uses SSO.
 */
authRouter.post("/master-login", (req, res) => {
  const parsed = MasterLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_credentials" });
  const email = parsed.data.email.trim().toLowerCase();

  const masterPw = config.auth.masterAdminPassword;
  if (!config.auth.masterAdminEmail || !masterPw) {
    return res.status(503).json({ error: "master_admin_not_configured" });
  }
  if (!isMaster(email) || !safeEqual(parsed.data.password, masterPw)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  issueSession(res, email);
  return res.json({ id: "master", email, name: "Master Admin", isMaster: true });
});

/** GET /api/auth/me — current ADMIN (admin console gate), or 401/403. */
authRouter.get("/me", async (req, res) => {
  const person = await currentPerson(req);
  if (!person) return res.status(401).json({ error: "unauthenticated" });
  if (!person.isAdmin && !isMaster(person.email)) {
    return res.status(403).json({ error: "forbidden" });
  }
  return res.json({ id: person.id, email: person.email, name: person.fullName, isMaster: isMaster(person.email) });
});

/** POST /api/auth/logout */
authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

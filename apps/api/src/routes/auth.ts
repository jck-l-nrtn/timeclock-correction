import { Router } from "express";
import { z } from "zod";
import { config, isProd } from "../config.js";
import { createMagicLink } from "../services/magicLink.js";
import { notifier } from "../services/notify.js";
import { prisma } from "../db/client.js";
import { clearSession, issueSession, readAdminId } from "../services/adminAuth.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const authRouter = Router();

const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/magic-link
 * Issue a status-lookup link for an email. Always returns 200 with no hint as
 * to whether the email exists (avoids account/enumeration leaks). In dev the
 * link is returned in the response so it can be tested without real email.
 */
authRouter.post("/magic-link", async (req, res) => {
  const parsed = MagicLinkRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_email" });
  }
  const email = parsed.data.email.toLowerCase();

  const token = await createMagicLink(email);
  const link = `${config.webOrigin}/status?token=${token}`;
  await notifier.sendMagicLink(email, link);

  // Never reveal whether the email has any requests. Surface the link only in dev.
  return res.json({ ok: true, ...(isProd ? {} : { devLink: link }) });
});

// ---- Admin auth ----------------------------------------------------------

const DevLoginSchema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/dev-login
 * Dev-only shortcut: sign in as a seeded admin without Jibble SSO. Disabled
 * when DEV_LOGIN_ENABLED=false (e.g. production).
 */
authRouter.post("/dev-login", async (req, res) => {
  if (!config.auth.devLoginEnabled) {
    return res.status(403).json({ error: "dev_login_disabled" });
  }
  const parsed = DevLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_email" });

  const admin = await prisma.admin.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!admin) return res.status(401).json({ error: "unknown_admin" });

  issueSession(res, admin.id);
  return res.json({ id: admin.id, email: admin.email, name: admin.name });
});

const AdminLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * POST /api/auth/admin-login
 * Admins sign in with their Jibble email + kiosk PIN. Access is granted only if
 * their Jibble role is Admin or Owner. We upsert a local Admin row so decisions
 * can be attributed. (Lightweight by design — a 4-digit PIN, not high security.)
 */
authRouter.post("/admin-login", async (req, res) => {
  const parsed = AdminLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_credentials" });
  const email = parsed.data.email.toLowerCase();

  const person = (await jibbleClient.listPeople()).find((p) => p.email.toLowerCase() === email);
  if (!person || person.pinCode !== parsed.data.password) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  if (person.role !== "Admin" && person.role !== "Owner") {
    return res.status(403).json({ error: "not_an_admin" });
  }

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { name: person.fullName, jibbleUserId: person.id },
    create: { email, name: person.fullName, jibbleUserId: person.id },
  });
  issueSession(res, admin.id);
  return res.json({ id: admin.id, email: admin.email, name: admin.name });
});

/** GET /api/auth/me — current admin, or 401 if not signed in. */
authRouter.get("/me", async (req, res) => {
  const adminId = readAdminId(req);
  if (!adminId) return res.status(401).json({ error: "unauthenticated" });
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) return res.status(401).json({ error: "unauthenticated" });
  return res.json({ id: admin.id, email: admin.email, name: admin.name });
});

/** POST /api/auth/logout */
authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

/**
 * Jibble SSO (authorization-code) placeholders — to implement once we confirm
 * Jibble exposes an OAuth app for this org:
 *   GET  /api/auth/jibble/start    -> redirect to Jibble authorize URL (state, PKCE)
 *   GET  /api/auth/jibble/callback -> exchange code, verify user is an org admin,
 *                                     upsert Admin, then issueSession(res, admin.id)
 * The rest of the app is unchanged because it only depends on the session cookie.
 */

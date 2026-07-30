import { Router } from "express";
import { z } from "zod";
import { config, isProd } from "../config.js";
import { createMagicLink } from "../services/magicLink.js";
import { notifier } from "../services/notify.js";
import { getAdminByEmail, upsertAdmin } from "../db/data.js";
import { clearSession, issueSession, readAdminEmail } from "../services/adminAuth.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const authRouter = Router();

const MagicLinkRequestSchema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/magic-link
 * Issue a status-lookup link for an email. Always returns 200 (no enumeration
 * leak). In dev the link is returned so it can be tested without real email.
 */
authRouter.post("/magic-link", async (req, res) => {
  const parsed = MagicLinkRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_email" });
  const email = parsed.data.email.toLowerCase();

  const token = await createMagicLink(email);
  const link = `${config.webOrigin}/status?token=${token}`;
  await notifier.sendMagicLink(email, link);

  return res.json({ ok: true, ...(isProd ? {} : { devLink: link }) });
});

const AdminLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * POST /api/auth/admin-login
 * Admins sign in with their Jibble email + kiosk PIN. Access is granted only if
 * their Jibble role is Admin or Owner. We upsert a local admin record so
 * decisions can be attributed.
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

  const admin = await upsertAdmin({ email, name: person.fullName, jibbleUserId: person.id });
  issueSession(res, admin.email);
  return res.json({ id: admin.id, email: admin.email, name: admin.name });
});

/** GET /api/auth/me — current admin, or 401 if not signed in. */
authRouter.get("/me", async (req, res) => {
  const email = readAdminEmail(req);
  if (!email) return res.status(401).json({ error: "unauthenticated" });
  const admin = await getAdminByEmail(email);
  if (!admin) return res.status(401).json({ error: "unauthenticated" });
  return res.json({ id: admin.id, email: admin.email, name: admin.name });
});

/** POST /api/auth/logout */
authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

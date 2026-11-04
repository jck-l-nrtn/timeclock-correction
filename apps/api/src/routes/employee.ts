import { Router } from "express";
import { z } from "zod";
import { getEmployeeByEmail } from "../db/data.js";
import { verifyPassword } from "../services/passwords.js";
import {
  clearEmployeeSession,
  issueEmployeeSession,
  readEmployeeEmail,
  resolveEmployee,
} from "../services/employeeAuth.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const employeeRouter = Router();

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function profile(e: { email: string; fullName: string; jibblePersonId: string | null }) {
  return { email: e.email, fullName: e.fullName, jibblePersonId: e.jibblePersonId };
}

/**
 * POST /api/employee/login
 * Sign in with work email + password. Accounts are created by an admin; there is
 * no self-signup or password change (a lightweight "use your own account" gate).
 */
employeeRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_credentials" });

  const emp = await getEmployeeByEmail(parsed.data.email);
  if (!emp || !verifyPassword(parsed.data.password, emp.passwordHash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  issueEmployeeSession(res, emp.email);
  return res.json(profile(emp));
});

/** GET /api/employee/me */
employeeRouter.get("/me", async (req, res) => {
  const email = readEmployeeEmail(req);
  if (!email) return res.status(401).json({ error: "unauthenticated" });
  const emp = await getEmployeeByEmail(email);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  return res.json(profile(emp));
});

/**
 * GET /api/employee/profile
 * Live Jibble profile details (phone, role, status, start date) for My Info.
 * Falls back to the stored name/email if Jibble has no match.
 */
employeeRouter.get("/profile", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  const fallback = {
    fullName: emp.fullName,
    email: emp.email,
    phoneNumber: null,
    role: null,
    status: null,
    startDate: null,
  };
  try {
    const details = await jibbleClient.getProfile(emp.email);
    return res.json(details ?? fallback);
  } catch (err) {
    console.error("[employee] profile lookup failed:", err);
    return res.json(fallback);
  }
});

/**
 * GET /api/employee/pto
 * The employee's time-off policy balances, live from Jibble.
 */
employeeRouter.get("/pto", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  const personId =
    emp.jibblePersonId ?? (await jibbleClient.findPersonByEmail(emp.email))?.id ?? null;
  if (!personId) return res.json([]);
  try {
    return res.json(await jibbleClient.getLeaveBalances(personId));
  } catch (err) {
    console.error("[employee] pto lookup failed:", err);
    return res.status(502).json({ error: "pto_unavailable" });
  }
});

/** POST /api/employee/logout */
employeeRouter.post("/logout", (_req, res) => {
  clearEmployeeSession(res);
  return res.json({ ok: true });
});

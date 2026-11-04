import { Router } from "express";
import { getEmployeeByEmail } from "../db/data.js";
import { clearEmployeeSession, resolveEmployee } from "../services/employeeAuth.js";
import { currentPerson, isMaster } from "../services/session.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const employeeRouter = Router();

function profile(e: { email: string; fullName: string; jibblePersonId: string | null; isAdmin?: boolean }) {
  return {
    email: e.email,
    fullName: e.fullName,
    jibblePersonId: e.jibblePersonId,
    isAdmin: Boolean(e.isAdmin) || isMaster(e.email),
  };
}

/** GET /api/employee/me — the signed-in person (employee or admin). */
employeeRouter.get("/me", async (req, res) => {
  const person = await currentPerson(req);
  if (!person || person.active === false) return res.status(401).json({ error: "unauthenticated" });
  return res.json(profile(person));
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

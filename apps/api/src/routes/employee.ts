import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { verifyPassword } from "../services/passwords.js";
import {
  clearEmployeeSession,
  issueEmployeeSession,
  readEmployeeId,
} from "../services/employeeAuth.js";

export const employeeRouter = Router();

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function profile(e: { email: string; fullName: string; jibblePersonId: string | null }) {
  return { email: e.email, fullName: e.fullName, jibblePersonId: e.jibblePersonId };
}

/**
 * POST /api/employee/login
 * Sign in with work email + password. Accounts are created by an admin (see
 * POST /api/admin/employees); employees can't sign up or change their password.
 * This is a lightweight "use your own account" gate, not a full credential system.
 */
employeeRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_credentials" });
  const email = parsed.data.email.toLowerCase();

  const emp = await prisma.employee.findUnique({ where: { email } });
  if (!emp || !verifyPassword(parsed.data.password, emp.passwordHash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  issueEmployeeSession(res, emp.id);
  return res.json(profile(emp));
});

/** GET /api/employee/me */
employeeRouter.get("/me", async (req, res) => {
  const id = readEmployeeId(req);
  if (!id) return res.status(401).json({ error: "unauthenticated" });
  const emp = await prisma.employee.findUnique({ where: { id } });
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  return res.json(profile(emp));
});

/** POST /api/employee/logout */
employeeRouter.post("/logout", (_req, res) => {
  clearEmployeeSession(res);
  return res.json({ ok: true });
});

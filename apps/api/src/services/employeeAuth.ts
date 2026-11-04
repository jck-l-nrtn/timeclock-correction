import type { Request } from "express";
import { currentPerson, issueSession, clearSession, readSessionEmail } from "./session.js";

/**
 * Back-compat shim over the unified `session.ts`. The employee session is now
 * the same `session` cookie as admins; `resolveEmployee` reads the Person from
 * it (the old magic-link token fallback is removed — SSO only).
 */
export const issueEmployeeSession = issueSession;
export const clearEmployeeSession = clearSession;
export const readEmployeeEmail = readSessionEmail;

export interface ResolvedEmployee {
  email: string;
  fullName: string;
  jibblePersonId: string | null;
}

/** Identify the acting employee from the unified session. */
export async function resolveEmployee(req: Request): Promise<ResolvedEmployee | null> {
  const p = await currentPerson(req);
  if (!p || p.active === false) return null;
  return { email: p.email, fullName: p.fullName, jibblePersonId: p.jibblePersonId };
}

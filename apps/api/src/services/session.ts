import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config, isProd } from "../config.js";
import { getPersonByEmail, type PersonItem } from "../db/data.js";

/**
 * Unified session — one HMAC-signed httpOnly cookie carrying { email, exp }.
 * Both employees and admins share it; admin access is decided by the Person's
 * `isAdmin` flag (or the master admin). Issued by the Google OAuth callback and
 * by the master-admin break-glass login. No JWT library: raw HMAC-SHA256.
 */
const COOKIE_NAME = "session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(payload: string): string {
  return createHmac("sha256", config.auth.sessionSecret).update(payload).digest("base64url");
}

export function issueSession(res: Response, email: string): void {
  const payload = Buffer.from(
    JSON.stringify({ email: email.trim().toLowerCase(), exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

/** Verify the session cookie and return the email, or null. */
export function readSessionEmail(req: Request): string | null {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof data.email !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return data.email;
  } catch {
    return null;
  }
}

/**
 * The approver a requester's alerts route to: their assigned manager, else the
 * master admin, else the default notify inbox.
 */
export async function approverEmailFor(email: string): Promise<string | undefined> {
  const p = await getPersonByEmail(email);
  return (
    p?.managerEmail || config.auth.masterAdminEmail || config.email.notifyTo || undefined
  );
}

/** True if the email is the configured break-glass master admin. */
export function isMaster(email: string | null | undefined): boolean {
  const master = config.auth.masterAdminEmail;
  return Boolean(master) && email?.trim().toLowerCase() === master;
}

/** The master admin as a synthetic Person (it has no DynamoDB row). */
export function masterPerson(): PersonItem {
  return {
    id: "master",
    email: config.auth.masterAdminEmail,
    fullName: "Master Admin",
    passwordHash: null,
    jibblePersonId: null,
    isAdmin: true,
    managerEmail: null,
    timeZone: config.jibble.orgTimeZone,
    active: true,
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

/** Load the acting Person from the session (master admin synthesized). */
export async function currentPerson(req: Request): Promise<PersonItem | null> {
  const email = readSessionEmail(req);
  if (!email) return null;
  if (isMaster(email)) return masterPerson();
  return getPersonByEmail(email);
}

/** Middleware: require any signed-in Person. Sets req.person. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const person = await currentPerson(req);
  if (!person || person.active === false) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  req.person = person;
  next();
}

/** Middleware: require an admin (Person.isAdmin or the master). Sets req.admin + req.person. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const person = await currentPerson(req);
  if (!person || person.active === false) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (!person.isAdmin && !isMaster(person.email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  req.person = person;
  req.admin = { id: person.id, email: person.email, name: person.fullName };
  req.isMaster = isMaster(person.email);
  next();
}

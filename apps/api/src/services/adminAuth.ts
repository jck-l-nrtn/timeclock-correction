import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config, isProd } from "../config.js";
import { prisma } from "../db/client.js";

/**
 * Admin session handling — a stateless, HMAC-signed httpOnly cookie carrying the
 * admin id + expiry. This is intentionally a thin seam:
 *
 *   - TODAY (Phase 4): sessions are minted by POST /api/auth/dev-login for a
 *     seeded admin, so the dashboard is usable without external dependencies.
 *   - LATER (Jibble SSO): the OAuth callback verifies the Jibble user, upserts
 *     an Admin row, and calls `issueSession` — nothing else changes. The queue,
 *     decision routes, and requireAdmin middleware are auth-mechanism agnostic.
 */

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function sign(payload: string): string {
  return createHmac("sha256", config.auth.sessionSecret).update(payload).digest("base64url");
}

/** Mint a session cookie for an admin id. */
export function issueSession(res: Response, adminId: string): void {
  const payload = Buffer.from(
    JSON.stringify({ adminId, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  res.cookie(COOKIE_NAME, token, {
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

/** Verify the session cookie and return the admin id, or null. */
export function readAdminId(req: Request): string | null {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      adminId?: unknown;
      exp?: unknown;
    };
    if (typeof data.adminId !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return data.adminId;
  } catch {
    return null;
  }
}

/** Express middleware: require a valid admin session, else 401. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminId = readAdminId(req);
  if (!adminId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  req.admin = { id: admin.id, email: admin.email, name: admin.name };
  next();
}

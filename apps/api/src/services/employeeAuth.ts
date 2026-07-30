import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { config, isProd } from "../config.js";
import { getEmployeeByEmail } from "../db/data.js";
import { resolveEmailFromToken } from "./magicLink.js";

/**
 * Employee session — an HMAC-signed httpOnly cookie carrying the employee email.
 * `resolveEmployee` unifies the two ways an employee is identified: a logged-in
 * session, or a magic-link token in the query/body (fallback).
 */
const COOKIE_NAME = "employee_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(payload: string): string {
  return createHmac("sha256", config.auth.sessionSecret).update(payload).digest("base64url");
}

export function issueEmployeeSession(res: Response, email: string): void {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearEmployeeSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readEmployeeEmail(req: Request): string | null {
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

export interface ResolvedEmployee {
  email: string;
  fullName: string;
  jibblePersonId: string | null;
}

/** Identify the acting employee from a session, or a magic-link token fallback. */
export async function resolveEmployee(req: Request): Promise<ResolvedEmployee | null> {
  const sessionEmail = readEmployeeEmail(req);
  if (sessionEmail) {
    const e = await getEmployeeByEmail(sessionEmail);
    if (e) return { email: e.email, fullName: e.fullName, jibblePersonId: e.jibblePersonId };
  }
  // Fallback: magic-link token (query for GETs, body for POSTs).
  const token =
    (typeof req.query.token === "string" && req.query.token) ||
    (typeof req.body?.token === "string" && req.body.token) ||
    "";
  const email = await resolveEmailFromToken(token);
  if (email) return { email, fullName: "", jibblePersonId: null };
  return null;
}

import { randomBytes } from "node:crypto";
import * as data from "../db/data.js";

/**
 * Magic-link tokens gate the employee status lookup. A token is a random,
 * single-purpose secret mapping back to one email for a short window.
 */
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Issue a new magic-link token for an email and persist it. */
export async function createMagicLink(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await data.createMagicLink(email, token, TOKEN_TTL_MS);
  return token;
}

/** Resolve the email a valid, unexpired token belongs to (or null). */
export async function resolveEmailFromToken(token: string): Promise<string | null> {
  return data.resolveEmailFromToken(token);
}

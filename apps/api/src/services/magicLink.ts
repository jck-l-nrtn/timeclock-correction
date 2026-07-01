import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";

/**
 * Magic-link tokens gate the employee status lookup so requests can't be read
 * by simply guessing an email. A token is a random, single-purpose secret that
 * maps back to one email for a short window.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Issue a new magic-link token for an email and persist it. */
export async function createMagicLink(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.magicLinkToken.create({
    data: {
      email: email.toLowerCase(),
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return token;
}

/**
 * Resolve the email a valid, unexpired token belongs to (or null).
 * Tokens remain valid within the TTL so the employee can refresh the page;
 * `usedAt` is reserved for future one-time-use flows.
 */
export async function resolveEmailFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.email;
}

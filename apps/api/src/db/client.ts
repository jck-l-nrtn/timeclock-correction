import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client. In dev with tsx watch, guard against creating a
 * new client on every hot reload (which exhausts DB connections).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

import "express";
import type { PersonItem } from "../db/data.js";

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAdmin once a valid admin session is verified. */
      admin?: { id: string; email: string; name: string };
      /** Populated by requireAuth/requireAdmin — the acting Person record. */
      person?: PersonItem;
      /** True when the acting admin is the break-glass master admin. */
      isMaster?: boolean;
    }
  }
}

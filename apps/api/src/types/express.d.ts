import "express";

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAdmin once a valid admin session cookie is verified. */
      admin?: { id: string; email: string; name: string };
    }
  }
}

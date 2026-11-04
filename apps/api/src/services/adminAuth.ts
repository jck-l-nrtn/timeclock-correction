/**
 * Back-compat shim. Admin/employee auth is now unified in `session.ts` (one
 * `session` cookie + Person.isAdmin). These re-exports keep existing imports
 * working. Prefer importing from `./session.js` in new code.
 */
export {
  issueSession,
  clearSession,
  readSessionEmail as readAdminEmail,
  requireAdmin,
} from "./session.js";

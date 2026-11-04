import { Router } from "express";
import { resolveEmployee } from "../services/employeeAuth.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const holidaysRouter = Router();

/**
 * GET /api/holidays
 * The organization's upcoming paid holidays, live from Jibble. Available to any
 * signed-in employee (session or magic-link token).
 */
holidaysRouter.get("/", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  try {
    return res.json(await jibbleClient.getUpcomingHolidays());
  } catch (err) {
    console.error("[holidays] lookup failed:", err);
    return res.status(502).json({ error: "holidays_unavailable" });
  }
});

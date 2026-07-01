import { Router } from "express";
import type { TimesheetDTO } from "@timesheet/shared";
import { resolveEmployee } from "../services/employeeAuth.js";
import { jibbleClient } from "../services/jibbleClient.js";

export const timesheetRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/timesheet?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The acting employee's live Jibble timesheet for a date range. Identified by
 * their login session (or a magic-link token fallback). Fetched live from Jibble.
 */
timesheetRouter.get("/", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });

  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return res.status(400).json({ error: "invalid_date_range" });
  }

  // Use the linked Jibble person id when we have it; otherwise resolve by email.
  let person: { id: string; fullName: string; email: string };
  if (emp.jibblePersonId) {
    person = { id: emp.jibblePersonId, fullName: emp.fullName, email: emp.email };
  } else {
    const p = await jibbleClient.findPersonByEmail(emp.email);
    if (!p) return res.status(404).json({ error: "no_jibble_person", email: emp.email });
    person = { id: p.id, fullName: p.fullName, email: p.email };
  }

  const entries = await jibbleClient.listEntries(person.id, from, to);
  const body: TimesheetDTO = { person, from, to, entries };
  return res.json(body);
});

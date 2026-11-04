import { Router, type Request, type Response, type NextFunction } from "express";
import { AdminDecisionSchema, RequestStatus } from "@timesheet/shared";
import * as data from "../db/data.js";
import { requireAdmin, isMaster } from "../services/session.js";
import { jibbleClient } from "../services/jibbleClient.js";
import { buildDigitalRecord } from "../services/digitalRecord.js";
import { notifier } from "../services/notify.js";
import { buildPayPeriodPdf, defaultWeekRange } from "../services/payPeriodReport.js";
import { toCorrectionRequestDTO } from "../mappers.js";

export const adminRouter = Router();

// Every admin route requires a valid admin session.
adminRouter.use(requireAdmin);

/** People management (org chart) is master-admin only. */
function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!req.isMaster) {
    res.status(403).json({ error: "master_admin_only" });
    return;
  }
  next();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const personView = (p: data.PersonItem) => ({
  id: p.id,
  email: p.email,
  fullName: p.fullName,
  jibblePersonId: p.jibblePersonId,
  isAdmin: Boolean(p.isAdmin),
  managerEmail: p.managerEmail ?? null,
  active: p.active !== false,
  createdAt: p.createdAt,
});

/** Map of each person's email → their approver's email (the org chart). */
async function managerMap(): Promise<Map<string, string | null>> {
  const people = await data.listPeople();
  return new Map(people.map((p) => [p.email, p.managerEmail ?? null]));
}

// ---- People / org chart ----------------------------------------------------

/** GET /api/admin/jibble-people — org people for the manual-add picker. */
adminRouter.get("/jibble-people", async (_req, res) => {
  return res.json(await jibbleClient.listPeople());
});

/** GET /api/admin/people — all app accounts (for the org-chart screen). */
adminRouter.get("/people", async (_req, res) => {
  const rows = await data.listPeople();
  return res.json(rows.map(personView));
});

/** Back-compat alias used by the existing admin UI. */
adminRouter.get("/employees", async (_req, res) => {
  const rows = await data.listPeople();
  return res.json(rows.map(personView));
});

/**
 * POST /api/admin/employees { jibblePersonId, isAdmin?, managerEmail? }
 * Manually provision an SSO-ready account for a Jibble person (no password —
 * they sign in with Google). Master-admin only.
 */
adminRouter.post("/employees", requireMaster, async (req, res) => {
  const jibblePersonId = typeof req.body?.jibblePersonId === "string" ? req.body.jibblePersonId : "";
  if (!jibblePersonId) return res.status(400).json({ error: "jibblePersonId_required" });

  const person = (await jibbleClient.listPeople()).find((p) => p.id === jibblePersonId);
  if (!person) return res.status(404).json({ error: "person_not_found" });
  if (!person.email) return res.status(400).json({ error: "person_has_no_email" });

  const email = person.email.toLowerCase();
  if (await data.getPersonByEmail(email)) return res.status(409).json({ error: "account_exists" });

  const created = await data.upsertPerson({
    email,
    fullName: person.fullName,
    jibblePersonId: person.id,
    isAdmin: req.body?.isAdmin === true,
    managerEmail:
      typeof req.body?.managerEmail === "string" && req.body.managerEmail
        ? req.body.managerEmail
        : null,
  });
  return res.status(201).json({ account: personView(created) });
});

/**
 * PUT /api/admin/people/:email { managerEmail?, isAdmin? }
 * Set a person's approver and/or admin flag (the org chart). Master-admin only.
 */
adminRouter.put("/people/:email", requireMaster, async (req, res) => {
  const email = req.params.email;
  const existing = await data.getPersonByEmail(email);
  if (!existing) return res.status(404).json({ error: "not_found" });

  if (typeof req.body?.managerEmail !== "undefined") {
    const m = req.body.managerEmail;
    if (m && typeof m === "string" && m.toLowerCase() === existing.email) {
      return res.status(400).json({ error: "cannot_manage_self" });
    }
    await data.setPersonManager(existing.email, m ? String(m) : null);
  }
  if (typeof req.body?.isAdmin === "boolean") {
    await data.setPersonAdmin(existing.email, req.body.isAdmin);
  }
  const updated = await data.getPersonByEmail(existing.email);
  return res.json(personView(updated!));
});

// ---- Pay-period report ----------------------------------------------------

/** GET /api/admin/reports/pay-period.pdf[?from&to] */
adminRouter.get("/reports/pay-period.pdf", async (req, res) => {
  const def = defaultWeekRange();
  const from = typeof req.query.from === "string" && DATE_RE.test(req.query.from) ? req.query.from : def.from;
  const to = typeof req.query.to === "string" && DATE_RE.test(req.query.to) ? req.query.to : def.to;
  const { buffer } = await buildPayPeriodPdf(from, to);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="timeclock-corrections-${from}_to_${to}.pdf"`);
  return res.send(buffer);
});

// ---- Review queue + decision log ------------------------------------------

/** GET /api/admin/requests?status=pending — review queue, scoped to my reports. */
adminRouter.get("/requests", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : RequestStatus.Pending;
  const rows = await data.listRequestsByStatus(status);
  const visible = req.isMaster ? rows : await filterToMyReports(rows, req.admin!.email);
  return res.json(visible.map(toCorrectionRequestDTO));
});

/** GET /api/admin/log — decided requests (newest first), scoped to my reports. */
adminRouter.get("/log", async (req, res) => {
  const rows = await data.listDecided();
  const visible = req.isMaster ? rows : await filterToMyReports(rows, req.admin!.email);
  return res.json(visible.map(toCorrectionRequestDTO));
});

/** Keep only requests whose requester's approver is this admin. */
async function filterToMyReports<T extends { employeeEmail: string }>(
  rows: T[],
  adminEmail: string
): Promise<T[]> {
  const mgr = await managerMap();
  return rows.filter((r) => mgr.get(r.employeeEmail.trim().toLowerCase()) === adminEmail);
}

/**
 * POST /api/admin/requests/:id/decision
 * Approve or deny a pending request. On approval, hand off to the Jibble adapter
 * (write / manual / failure), stamp the digital record, and notify.
 */
adminRouter.post("/requests/:id/decision", async (req, res) => {
  const parsed = AdminDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_failed",
      issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const { decision, note } = parsed.data;

  const row = await data.getRequestById(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.status !== RequestStatus.Pending) {
    return res.status(409).json({ error: "already_decided", status: row.status });
  }

  // Only the requester's assigned approver (or the master admin) may decide.
  if (!req.isMaster) {
    const requester = await data.getPersonByEmail(row.employeeEmail);
    if ((requester?.managerEmail ?? null) !== req.admin!.email) {
      return res.status(403).json({ error: "not_your_report" });
    }
  }

  const admin = req.admin!;
  row.decisionNote = note ?? null;
  row.decidedByAdminId = admin.id;
  row.decidedByName = admin.name;
  row.decidedAt = new Date().toISOString();

  if (decision === RequestStatus.Denied) {
    row.status = RequestStatus.Denied;
  } else if (row.kind === "timeoff") {
    // PTO is approved in-app only — no Jibble write.
    row.status = RequestStatus.Approved;
  } else {
    row.status = RequestStatus.Approved;
    try {
      // The DTO carries decidedBy/decidedAt so the adapter can stamp the note.
      const result = await jibbleClient.applyCorrection(toCorrectionRequestDTO(row));
      if (result.kind === "applied") {
        row.status = RequestStatus.Applied;
        row.jibbleResult = `Jibble entry ${result.jibbleEntryId}`;
      } else {
        row.jibbleResult = result.instruction;
      }
    } catch (err) {
      row.status = RequestStatus.Failed;
      row.jibbleResult = `Jibble write failed: ${String(err)}`;
    }
  }

  // The immutable digital record (with signature) is for timeclock corrections.
  if (row.kind !== "timeoff") {
    row.digitalRecord = JSON.stringify(buildDigitalRecord(row, admin.name));
  }
  const saved = await data.putRequest(row);

  const dto = toCorrectionRequestDTO(saved);
  // Await so the email send completes before Lambda freezes the execution env.
  try {
    await notifier.requestDecided(dto);
  } catch (e) {
    console.error("[admin] notify failed:", e);
  }
  return res.json(dto);
});

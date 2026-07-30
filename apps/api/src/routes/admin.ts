import { Router } from "express";
import { AdminDecisionSchema, RequestStatus } from "@timesheet/shared";
import * as data from "../db/data.js";
import { requireAdmin } from "../services/adminAuth.js";
import { jibbleClient } from "../services/jibbleClient.js";
import { buildDigitalRecord } from "../services/digitalRecord.js";
import { notifier } from "../services/notify.js";
import { hashPassword } from "../services/passwords.js";
import { config } from "../config.js";
import { buildPayPeriodPdf, defaultWeekRange } from "../services/payPeriodReport.js";
import { toCorrectionRequestDTO } from "../mappers.js";

export const adminRouter = Router();

// Every admin route requires a valid admin session.
adminRouter.use(requireAdmin);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Employee account management -----------------------------------------

/** GET /api/admin/jibble-people — org people for the account-creation picker. */
adminRouter.get("/jibble-people", async (_req, res) => {
  return res.json(await jibbleClient.listPeople());
});

/** GET /api/admin/employees — app accounts that have been created. */
adminRouter.get("/employees", async (_req, res) => {
  const rows = await data.listEmployees();
  return res.json(
    rows.map((e) => ({
      id: e.id,
      email: e.email,
      fullName: e.fullName,
      jibblePersonId: e.jibblePersonId,
      createdAt: e.createdAt,
    }))
  );
});

/**
 * POST /api/admin/employees { jibblePersonId, password? }
 * Create an employee login for a Jibble person. Username = email; default
 * password = their Jibble kiosk PIN (or an explicit override).
 */
adminRouter.post("/employees", async (req, res) => {
  const jibblePersonId = typeof req.body?.jibblePersonId === "string" ? req.body.jibblePersonId : "";
  const override = typeof req.body?.password === "string" ? req.body.password.trim() : "";
  if (!jibblePersonId) return res.status(400).json({ error: "jibblePersonId_required" });

  const person = (await jibbleClient.listPeople()).find((p) => p.id === jibblePersonId);
  if (!person) return res.status(404).json({ error: "person_not_found" });
  if (!person.email) return res.status(400).json({ error: "person_has_no_email" });

  const email = person.email.toLowerCase();
  if (await data.getEmployeeByEmail(email)) return res.status(409).json({ error: "account_exists" });

  const tempPassword = override || person.pinCode || "";
  if (!tempPassword) {
    return res.status(400).json({ error: "no_default_password", detail: "This person has no kiosk PIN; provide a password." });
  }

  const emp = await data.createEmployee({
    email,
    fullName: person.fullName,
    passwordHash: hashPassword(tempPassword),
    jibblePersonId: person.id,
  });

  notifier
    .sendCredentials(email, { loginUrl: config.webOrigin, tempPassword })
    .catch((e) => console.error("[admin] sendCredentials failed:", e));

  return res.status(201).json({
    account: {
      id: emp.id,
      email: emp.email,
      fullName: emp.fullName,
      jibblePersonId: emp.jibblePersonId,
      createdAt: emp.createdAt,
    },
    tempPassword,
  });
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

/** GET /api/admin/requests?status=pending — review queue for a status. */
adminRouter.get("/requests", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : RequestStatus.Pending;
  const rows = await data.listRequestsByStatus(status);
  return res.json(rows.map(toCorrectionRequestDTO));
});

/** GET /api/admin/log — every decided request, newest first. */
adminRouter.get("/log", async (_req, res) => {
  const rows = await data.listDecided();
  return res.json(rows.map(toCorrectionRequestDTO));
});

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

  const admin = req.admin!;
  row.decisionNote = note ?? null;
  row.decidedByAdminId = admin.id;
  row.decidedByName = admin.name;
  row.decidedAt = new Date().toISOString();

  if (decision === RequestStatus.Denied) {
    row.status = RequestStatus.Denied;
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

  row.digitalRecord = JSON.stringify(buildDigitalRecord(row, admin.name));
  const saved = await data.putRequest(row);

  const dto = toCorrectionRequestDTO(saved);
  notifier.requestDecided(dto).catch((e) => console.error("[admin] notify failed:", e));
  return res.json(dto);
});

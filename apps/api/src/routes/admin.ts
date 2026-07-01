import { Router } from "express";
import { AdminDecisionSchema, RequestStatus } from "@timesheet/shared";
import { prisma } from "../db/client.js";
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

// ---- Employee account management -----------------------------------------

/** GET /api/admin/jibble-people — org people for the account-creation picker. */
adminRouter.get("/jibble-people", async (_req, res) => {
  const people = await jibbleClient.listPeople();
  return res.json(people);
});

/** GET /api/admin/employees — app accounts that have been created. */
adminRouter.get("/employees", async (_req, res) => {
  const rows = await prisma.employee.findMany({ orderBy: { fullName: "asc" } });
  return res.json(
    rows.map((e) => ({
      id: e.id,
      email: e.email,
      fullName: e.fullName,
      jibblePersonId: e.jibblePersonId,
      createdAt: e.createdAt.toISOString(),
    }))
  );
});

/**
 * POST /api/admin/employees { jibblePersonId, password? }
 * Create an employee login for a chosen Jibble person. Username is their email;
 * the default password is their Jibble kiosk PIN (or an explicit override). The
 * account must change the password on first sign-in, and we "send" the details.
 */
adminRouter.post("/employees", async (req, res) => {
  const jibblePersonId = typeof req.body?.jibblePersonId === "string" ? req.body.jibblePersonId : "";
  const override = typeof req.body?.password === "string" ? req.body.password.trim() : "";
  if (!jibblePersonId) return res.status(400).json({ error: "jibblePersonId_required" });

  const person = (await jibbleClient.listPeople()).find((p) => p.id === jibblePersonId);
  if (!person) return res.status(404).json({ error: "person_not_found" });
  if (!person.email) return res.status(400).json({ error: "person_has_no_email" });

  const email = person.email.toLowerCase();
  if (await prisma.employee.findUnique({ where: { email } })) {
    return res.status(409).json({ error: "account_exists" });
  }

  const tempPassword = override || person.pinCode || "";
  if (!tempPassword) {
    return res.status(400).json({ error: "no_default_password", detail: "This person has no kiosk PIN; provide a password." });
  }

  const emp = await prisma.employee.create({
    data: {
      email,
      fullName: person.fullName,
      jibblePersonId: person.id,
      passwordHash: hashPassword(tempPassword),
    },
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
      createdAt: emp.createdAt.toISOString(),
    },
    // Returned so the admin can read the password (kiosk PIN) to the employee.
    tempPassword,
  });
});

/**
 * GET /api/admin/requests?status=pending
 * Review queue. Defaults to newest-last (FIFO) so the oldest pending request
 * is actioned first. Omit `status` to see everything.
 */
adminRouter.get("/requests", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await prisma.correctionRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "asc" },
  });
  return res.json(rows.map(toCorrectionRequestDTO));
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/admin/reports/pay-period.pdf[?from&to]
 * Download the pay-period sign-off PDF on demand (defaults to the last 7 days).
 */
adminRouter.get("/reports/pay-period.pdf", async (req, res) => {
  const def = defaultWeekRange();
  const from = typeof req.query.from === "string" && DATE_RE.test(req.query.from) ? req.query.from : def.from;
  const to = typeof req.query.to === "string" && DATE_RE.test(req.query.to) ? req.query.to : def.to;
  const { buffer } = await buildPayPeriodPdf(from, to);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="timeclock-corrections-${from}_to_${to}.pdf"`);
  return res.send(buffer);
});

/**
 * GET /api/admin/log
 * Audit log of every decided request (approved / denied / applied / failed),
 * newest first, with the deciding admin's name and the per-entry record.
 */
adminRouter.get("/log", async (_req, res) => {
  const rows = await prisma.correctionRequest.findMany({
    where: { status: { not: RequestStatus.Pending } },
    orderBy: { decidedAt: "desc" },
    include: { decidedByAdmin: true },
  });
  return res.json(rows.map(toCorrectionRequestDTO));
});

/**
 * POST /api/admin/requests/:id/decision
 * Approve or deny a pending request. On approval we hand off to the Jibble
 * adapter, which either writes the entry (status -> applied) or returns a
 * manual instruction (status stays approved with the instruction recorded).
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

  const existing = await prisma.correctionRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.status !== RequestStatus.Pending) {
    return res.status(409).json({ error: "already_decided", status: existing.status });
  }

  const decidedBy = { decidedByAdminId: req.admin!.id, decidedAt: new Date(), decisionNote: note ?? null };

  let row = await prisma.correctionRequest.update({
    where: { id: existing.id },
    data: { status: decision === RequestStatus.Denied ? RequestStatus.Denied : RequestStatus.Approved, ...decidedBy },
    include: { decidedByAdmin: true },
  });

  // On approval, hand off to the Jibble adapter (write / manual / failure). The
  // DTO carries decidedBy/decidedAt so the adapter can stamp the Jibble note.
  if (decision === RequestStatus.Approved) {
    try {
      const result = await jibbleClient.applyCorrection(toCorrectionRequestDTO(row));
      if (result.kind === "applied") {
        row = await prisma.correctionRequest.update({
          where: { id: row.id },
          data: { status: RequestStatus.Applied, jibbleResult: `Jibble entry ${result.jibbleEntryId}` },
          include: { decidedByAdmin: true },
        });
      } else {
        // Manual fallback: approved, but an admin must apply it in Jibble by hand.
        row = await prisma.correctionRequest.update({
          where: { id: row.id },
          data: { jibbleResult: result.instruction },
          include: { decidedByAdmin: true },
        });
      }
    } catch (err) {
      row = await prisma.correctionRequest.update({
        where: { id: row.id },
        data: { status: RequestStatus.Failed, jibbleResult: `Jibble write failed: ${String(err)}` },
        include: { decidedByAdmin: true },
      });
    }
  }

  // Stamp the immutable digital record from the settled row, then notify.
  const record = buildDigitalRecord(row, req.admin!.name);
  const finalRow = await prisma.correctionRequest.update({
    where: { id: row.id },
    data: { digitalRecord: JSON.stringify(record) },
    include: { decidedByAdmin: true },
  });

  const dto = toCorrectionRequestDTO(finalRow);
  notifier.requestDecided(dto).catch((e) => console.error("[admin] notify failed:", e));
  return res.json(dto);
});

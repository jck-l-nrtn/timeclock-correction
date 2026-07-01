import { Router } from "express";
import { AcknowledgeSchema, CreateCorrectionRequestSchema, RequestStatus } from "@timesheet/shared";
import { prisma } from "../db/client.js";
import { jibbleClient } from "../services/jibbleClient.js";
import { notifier } from "../services/notify.js";
import { resolveEmployee } from "../services/employeeAuth.js";
import { toCorrectionRequestDTO } from "../mappers.js";

export const requestsRouter = Router();

/**
 * GET /api/requests?token=...
 * Employee status lookup. The magic-link token maps to exactly one email; we
 * only ever return that email's requests. No token => 401 (never a bare
 * email lookup, which would leak other people's data).
 */
requestsRouter.get("/", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  const rows = await prisma.correctionRequest.findMany({
    where: { employeeEmail: emp.email.toLowerCase() },
    orderBy: { createdAt: "desc" },
  });
  return res.json(rows.map(toCorrectionRequestDTO));
});

/**
 * POST /api/requests
 * Employee submits a missed-timeclock / adjustment request.
 * Body is validated against the SAME zod schema the frontend uses.
 */
requestsRouter.post("/", async (req, res) => {
  // A logged-in employee's identity is authoritative — override any body values
  // so they can't submit on someone else's behalf. Anonymous (QR) submissions
  // fall back to the name/email typed in the body.
  const emp = await resolveEmployee(req);
  const body = { ...req.body };
  if (emp) {
    body.employeeEmail = emp.email;
    if (emp.fullName) body.employeeName = emp.fullName;
    if (emp.jibblePersonId) body.jibblePersonId = emp.jibblePersonId;
  }

  const parsed = CreateCorrectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_failed",
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }
  const input = parsed.data;

  // Best-effort: resolve the Jibble person from email if the employee didn't
  // supply an id. Never blocks submission — resolution can also happen at
  // approval time (Phase 5).
  let jibblePersonId = input.jibblePersonId ?? null;
  if (!jibblePersonId) {
    try {
      const person = await jibbleClient.findPersonByEmail(input.employeeEmail);
      jibblePersonId = person?.id ?? null;
    } catch (err) {
      console.warn("[requests] person lookup failed (non-fatal):", err);
    }
  }

  const row = await prisma.correctionRequest.create({
    data: {
      employeeName: input.employeeName,
      employeeEmail: input.employeeEmail.toLowerCase(),
      jibblePersonId,
      jibbleEntryId: input.jibbleEntryId ?? null,
      date: input.date,
      eventType: input.eventType,
      intendedTime: input.intendedTime,
      reason: input.reason,
      affirmed: input.affirmed,
      status: RequestStatus.Pending,
    },
  });

  const dto = toCorrectionRequestDTO(row);

  // Fire-and-forget admin notification; a failure here must not fail the submit.
  notifier.newRequestSubmitted(dto).catch((err) =>
    console.error("[requests] notify failed:", err)
  );

  return res.status(201).json(dto);
});

/**
 * GET /api/requests/:id
 * Fetch a single request (used by the submission confirmation screen).
 */
requestsRouter.get("/:id", async (req, res) => {
  const row = await prisma.correctionRequest.findUnique({
    where: { id: req.params.id },
  });
  if (!row) return res.status(404).json({ error: "not_found" });
  return res.json(toCorrectionRequestDTO(row));
});

/**
 * POST /api/requests/:id/acknowledge
 * Employee digitally signs off on a decided correction. Magic-link gated, and
 * the token's email must own the request. Records a typed-name signature once.
 */
requestsRouter.post("/:id/acknowledge", async (req, res) => {
  const parsed = AcknowledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_failed",
      issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const { signature } = parsed.data;

  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });

  const row = await prisma.correctionRequest.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.employeeEmail !== emp.email.toLowerCase()) return res.status(403).json({ error: "not_your_request" });

  const acknowledgeable: string[] = [RequestStatus.Approved, RequestStatus.Applied, RequestStatus.Failed];
  if (!acknowledgeable.includes(row.status)) {
    return res.status(409).json({ error: "not_acknowledgeable", status: row.status });
  }
  if (row.employeeAckSignature) {
    return res.status(409).json({ error: "already_acknowledged" });
  }

  const updated = await prisma.correctionRequest.update({
    where: { id: row.id },
    data: { employeeAckSignature: signature.trim(), ackAt: new Date() },
  });
  return res.json(toCorrectionRequestDTO(updated));
});

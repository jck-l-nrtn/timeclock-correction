import { Router } from "express";
import { AcknowledgeSchema, CreateCorrectionRequestSchema, RequestStatus } from "@timesheet/shared";
import * as data from "../db/data.js";
import { jibbleClient } from "../services/jibbleClient.js";
import { notifier } from "../services/notify.js";
import { resolveEmployee } from "../services/employeeAuth.js";
import { toCorrectionRequestDTO } from "../mappers.js";

export const requestsRouter = Router();

/**
 * GET /api/requests
 * The acting employee's requests (session, or magic-link token fallback).
 */
requestsRouter.get("/", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  const rows = await data.listRequestsByEmployee(emp.email);
  return res.json(rows.map(toCorrectionRequestDTO));
});

/**
 * POST /api/requests
 * Employee submits a missed-timeclock / adjustment request. A logged-in
 * employee's identity is authoritative; anonymous (QR) submissions use the body.
 */
requestsRouter.post("/", async (req, res) => {
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
      issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;

  // Best-effort Jibble person resolution when the employee didn't supply an id.
  let jibblePersonId = input.jibblePersonId ?? null;
  if (!jibblePersonId) {
    try {
      const person = await jibbleClient.findPersonByEmail(input.employeeEmail);
      jibblePersonId = person?.id ?? null;
    } catch (err) {
      console.warn("[requests] person lookup failed (non-fatal):", err);
    }
  }

  const row = await data.createRequest({
    employeeName: input.employeeName,
    employeeEmail: input.employeeEmail,
    jibblePersonId,
    jibbleEntryId: input.jibbleEntryId ?? null,
    date: input.date,
    eventType: input.eventType,
    intendedTime: input.intendedTime,
    reason: input.reason,
    affirmed: input.affirmed,
  });

  const dto = toCorrectionRequestDTO(row);
  notifier.newRequestSubmitted(dto).catch((err) => console.error("[requests] notify failed:", err));
  return res.status(201).json(dto);
});

/** GET /api/requests/:id */
requestsRouter.get("/:id", async (req, res) => {
  const row = await data.getRequestById(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  return res.json(toCorrectionRequestDTO(row));
});

/**
 * POST /api/requests/:id/acknowledge
 * Employee digitally signs off on a decided correction. Magic-link or session
 * gated, and the acting email must own the request. One-time.
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

  const row = await data.getRequestById(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.employeeEmail !== emp.email.toLowerCase()) return res.status(403).json({ error: "not_your_request" });

  const acknowledgeable: string[] = [RequestStatus.Approved, RequestStatus.Applied, RequestStatus.Failed];
  if (!acknowledgeable.includes(row.status)) {
    return res.status(409).json({ error: "not_acknowledgeable", status: row.status });
  }
  if (row.employeeAckSignature) return res.status(409).json({ error: "already_acknowledged" });

  row.employeeAckSignature = signature.trim();
  row.ackAt = new Date().toISOString();
  const updated = await data.putRequest(row);
  return res.json(toCorrectionRequestDTO(updated));
});

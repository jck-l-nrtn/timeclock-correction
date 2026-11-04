import { Router } from "express";
import { CreatePtoRequestSchema } from "@timesheet/shared";
import * as data from "../db/data.js";
import { notifier } from "../services/notify.js";
import { resolveEmployee } from "../services/employeeAuth.js";
import { approverEmailFor } from "../services/session.js";
import { toCorrectionRequestDTO } from "../mappers.js";

export const ptoRouter = Router();

/**
 * POST /api/pto
 * Employee submits a time-off (PTO) request. A logged-in employee's identity is
 * authoritative. Routed to an admin for approval (no Jibble write).
 */
ptoRouter.post("/", async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(401).json({ error: "unauthenticated" });
  const body = { ...req.body };
  body.employeeEmail = emp.email;
  if (emp.fullName) body.employeeName = emp.fullName;
  if (emp.jibblePersonId) body.jibblePersonId = emp.jibblePersonId;

  const parsed = CreatePtoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_failed",
      issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;

  const row = await data.createPtoRequest({
    employeeName: input.employeeName,
    employeeEmail: input.employeeEmail,
    jibblePersonId: input.jibblePersonId ?? null,
    ptoType: input.ptoType,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    payoutHours: input.payoutHours ?? null,
    reason: input.reason,
  });

  const dto = toCorrectionRequestDTO(row);
  // Await so the email send completes before Lambda freezes the execution env.
  try {
    await notifier.newRequestSubmitted(dto, await approverEmailFor(input.employeeEmail));
  } catch (err) {
    console.error("[pto] notify failed:", err);
  }
  return res.status(201).json(dto);
});

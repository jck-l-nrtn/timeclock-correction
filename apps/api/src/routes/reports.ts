import { Router } from "express";
import { config } from "../config.js";
import { buildPayPeriodPdf, defaultWeekRange } from "../services/payPeriodReport.js";
import { sendEmail } from "../services/email.js";

export const reportsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangeFromQuery(req: { query: Record<string, unknown> }): { from: string; to: string } {
  const def = defaultWeekRange();
  const from = typeof req.query.from === "string" && DATE_RE.test(req.query.from) ? req.query.from : def.from;
  const to = typeof req.query.to === "string" && DATE_RE.test(req.query.to) ? req.query.to : def.to;
  return { from, to };
}

/**
 * POST /api/reports/pay-period/send?token=...[&from&to]
 * Builds the pay-period sign-off PDF and emails it to the configured owner.
 * Gated by REPORT_TOKEN so a scheduler (GitHub Actions cron) can trigger it.
 */
reportsRouter.post("/pay-period/send", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!config.reports.token || token !== config.reports.token) {
    return res.status(401).json({ error: "invalid_token" });
  }

  const { from, to } = rangeFromQuery(req);
  const { buffer, count } = await buildPayPeriodPdf(from, to);

  await sendEmail({
    subject: `${config.orgName} timeclock corrections — ${from} to ${to} (${count})`,
    text:
      `Attached is the pay-period sign-off sheet: ${count} correction(s) for ${from} to ${to}.\n\n` +
      `Please review and collect employee + owner signatures before payroll is processed.`,
    attachments: [
      {
        filename: `timeclock-corrections-${from}_to_${to}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      },
    ],
  });

  return res.json({ ok: true, from, to, count });
});

import PDFDocument from "pdfkit";
import { listChangesInRange, type RequestItem } from "../db/data.js";
import { config } from "../config.js";

const EVENT_LABEL: Record<string, string> = {
  in: "Missed clock-in",
  out: "Missed clock-out",
  adjust: "Time adjustment",
};

/** The last 7 days (default weekly pay period), as YYYY-MM-DD. */
export function defaultWeekRange(): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(new Date(now.getTime() - 7 * 86400000)), to: iso(now) };
}

/**
 * Build a sign-off PDF of every applied/approved correction whose date falls in
 * [from, to]. Grouped by employee, each with a signature line, plus an owner
 * approval line at the end — to be signed before payroll is processed.
 */
export async function buildPayPeriodPdf(
  from: string,
  to: string
): Promise<{ buffer: Buffer; count: number }> {
  const rows: RequestItem[] = await listChangesInRange(from, to);
  rows.sort(
    (a, b) =>
      a.employeeName.localeCompare(b.employeeName) ||
      a.date.localeCompare(b.date) ||
      a.intendedTime.localeCompare(b.intendedTime)
  );

  // Group by employee.
  const byEmployee = new Map<string, RequestItem[]>();
  for (const r of rows) {
    const list = byEmployee.get(r.employeeName) ?? [];
    list.push(r);
    byEmployee.set(r.employeeName, list);
  }

  const doc = new PDFDocument({ margin: 50, size: "LETTER" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // Header
  doc.fontSize(18).font("Helvetica-Bold").text(config.orgName);
  doc.fontSize(13).font("Helvetica").text("Timeclock Corrections — Pay Period Sign-off");
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#555").text(`Pay period: ${from} to ${to}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.fillColor("#000").moveDown(1);

  if (rows.length === 0) {
    doc.fontSize(12).text("No timeclock corrections were approved for this pay period.");
  }

  for (const [name, list] of byEmployee) {
    ensureSpace(doc, 140);
    doc.fontSize(13).font("Helvetica-Bold").text(name);
    doc.moveDown(0.2);
    doc.fontSize(10).font("Helvetica");

    for (const r of list) {
      ensureSpace(doc, 46);
      const label = EVENT_LABEL[r.eventType] ?? r.eventType;
      const approver = r.decidedByName ?? "—";
      const when = r.decidedAt ? new Date(r.decidedAt).toLocaleDateString() : "";
      doc.font("Helvetica-Bold").text(`• ${label} — ${r.date} at ${r.intendedTime}`);
      doc.font("Helvetica").fillColor("#444");
      doc.text(`   Reason: ${r.reason}`);
      doc.text(`   Approved by ${approver}${when ? ` on ${when}` : ""}${r.decisionNote ? ` — note: ${r.decisionNote}` : ""}`);
      doc.fillColor("#000").moveDown(0.4);
    }

    // Employee signature line
    doc.moveDown(0.3);
    signatureLine(doc, `${name} — signature`);
    doc.moveDown(1);
  }

  // Owner approval
  ensureSpace(doc, 120);
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica-Bold").text("Reviewed and approved for payroll:");
  doc.moveDown(0.6);
  signatureLine(doc, "Owner / Manager — signature");

  doc.end();
  const buffer = await done;
  return { buffer, count: rows.length };
}

function signatureLine(doc: PDFKit.PDFDocument, label: string) {
  const y = doc.y + 12;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .moveTo(left, y)
    .lineTo(right - 140, y)
    .strokeColor("#999")
    .stroke();
  doc.moveTo(right - 120, y).lineTo(right, y).stroke();
  doc.strokeColor("#000");
  doc.fontSize(8).fillColor("#666");
  doc.text(label, left, y + 3);
  doc.text("Date", right - 120, y + 3);
  doc.fillColor("#000").fontSize(10);
  doc.y = y + 20;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

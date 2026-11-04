/**
 * Employee-hub configuration — edit these for Montane.
 * (Later these can move to admin-editable settings; for now they live here.)
 */

export interface Holiday {
  name: string;
  /** ISO date YYYY-MM-DD */
  date: string;
}

/** Company paid holidays. Replace with Montane's official list. */
export const PAID_HOLIDAYS: Holiday[] = [
  { name: "New Year's Day", date: "2026-01-01" },
  { name: "Memorial Day", date: "2026-05-25" },
  { name: "Independence Day", date: "2026-07-03" },
  { name: "Pioneer Day", date: "2026-07-24" },
  { name: "Labor Day", date: "2026-09-07" },
  { name: "Thanksgiving Day", date: "2026-11-26" },
  { name: "Day after Thanksgiving", date: "2026-11-27" },
  { name: "Christmas Eve", date: "2026-12-24" },
  { name: "Christmas Day", date: "2026-12-25" },
  { name: "New Year's Day", date: "2027-01-01" },
];

export interface ExternalLink {
  label: string;
  url: string;
  desc: string;
}

/** External tools. Set the URLs — an empty url renders as "ask your admin". */
export const QUICK_LINKS: ExternalLink[] = [
  {
    label: "Payroll",
    url: "https://meridianfinancial.myfileguardian.com/hub",
    desc: "Pay stubs, W-2s, and tax documents",
  },
  {
    label: "Reimbursement form",
    url: "https://forms.gle/caAr5LEQbSV4QyhT6",
    desc: "Submit an expense for reimbursement",
  },
];

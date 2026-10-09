export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Interested",
  "Site Visit Scheduled",
  "Site Visit Done",
  "Negotiation",
  "Booked",
  "Not Interested",
  "Lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ["Facebook", "Instagram", "Google", "YouTube", "99acres", "MagicBricks", "Walk-in", "Referral", "Other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const PROPERTY_TYPES = ["1BHK", "2BHK", "3BHK", "Plot", "Commercial"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const DATA_STATUSES = ["Fresh", "Called", "Not Reachable", "Wrong Number"] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

/** Tone token per status — maps to badge-* classes in styles.css */
export const STATUS_TONE: Record<string, string> = {
  New: "badge-blue",
  Contacted: "badge-slate",
  Interested: "badge-teal",
  "Site Visit Scheduled": "badge-violet",
  "Site Visit Done": "badge-indigo",
  Negotiation: "badge-amber",
  Booked: "badge-green",
  "Not Interested": "badge-grey",
  Lost: "badge-red",
  Fresh: "badge-blue",
  Called: "badge-green",
  "Not Reachable": "badge-amber",
  "Wrong Number": "badge-red",
  Converted: "badge-gold",
  Available: "badge-green",
  Blocked: "badge-amber",
  Sold: "badge-red",
};

/**
 * Normalise an Indian mobile number to 10 digits.
 * Accepts optional +91 / 91 / 0 prefix, spaces and dashes. Returns null if invalid.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = String(input).replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function formatPhone(p: string) {
  return p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p;
}

export function formatBudget(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(n % 10000000 ? 2 : 0)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

export type FollowUpBucket = "today" | "overdue" | "upcoming";
export function followUpBucket(date: string | null, now = new Date()): FollowUpBucket | null {
  if (!date) return null;
  const d = new Date(date);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (d >= start && d < end) return d < now ? "overdue" : "today";
  return d < start ? "overdue" : "upcoming";
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function downloadFile(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

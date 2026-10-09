export type MilestoneDraft = { name: string; percentage: number; due_date?: string | null };

export function canManageDeal(isAdmin: boolean, assignedTo: string, userId: string) {
  return isAdmin || assignedTo === userId;
}

export function toDealsCsv(rows: string[][]) {
  return rows.map((row) => row.map((cell) => {
    const value = String(cell);
    const safeValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}

export const CONSTRUCTION_PAYMENT_PLAN: MilestoneDraft[] = [
  { name: "Booking token", percentage: 10, due_date: null },
  { name: "Foundation", percentage: 20, due_date: null },
  { name: "Superstructure", percentage: 30, due_date: null },
  { name: "Finishing", percentage: 20, due_date: null },
  { name: "Handover & registry", percentage: 20, due_date: null },
];

export function isValidMilestoneSchedule(milestones: MilestoneDraft[]) {
  return (
    milestones.length > 0 &&
    milestones.length <= 20 &&
    milestones.every((item) => item.name.trim().length > 0 && Number.isFinite(item.percentage) && item.percentage > 0 && item.percentage <= 100) &&
    Math.abs(milestones.reduce((sum, item) => sum + item.percentage, 0) - 100) < 0.005
  );
}

export function getMilestoneState(amountDue: number, paid: number, dueDate: string | null, now = new Date()) {
  if (paid >= amountDue - 0.01) return "Paid" as const;
  if (dueDate) {
    const due = new Date(`${dueDate}T00:00:00`);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (due < today) return "Overdue" as const;
  }
  if (paid > 0) return "Partially paid" as const;
  return "Pending" as const;
}

export function splitMilestoneAmounts(agreedPrice: number, milestones: MilestoneDraft[]) {
  let assigned = 0;
  return milestones.map((milestone, index) => {
    const amount = index === milestones.length - 1
      ? Math.round((agreedPrice - assigned) * 100) / 100
      : Math.round((agreedPrice * milestone.percentage) / 100 * 100) / 100;
    assigned += amount;
    return amount;
  });
}
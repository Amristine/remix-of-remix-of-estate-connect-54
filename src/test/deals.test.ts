import { describe, expect, it } from "vitest";
import { canManageDeal, CONSTRUCTION_PAYMENT_PLAN, getMilestoneState, isValidMilestoneSchedule, splitMilestoneAmounts, toDealsCsv } from "@/lib/deals";

describe("construction-linked bookings", () => {
  it("uses the agreed construction stages and percentage split", () => {
    expect(CONSTRUCTION_PAYMENT_PLAN.map((stage) => stage.percentage)).toEqual([10, 20, 30, 20, 20]);
    expect(isValidMilestoneSchedule(CONSTRUCTION_PAYMENT_PLAN)).toBe(true);
  });

  it("requires every milestone percentage to total exactly 100", () => {
    expect(isValidMilestoneSchedule([{ name: "Token", percentage: 10 }, { name: "Foundation", percentage: 80 }])).toBe(false);
  });

  it("distributes rounded stage amounts without losing paise", () => {
    expect(splitMilestoneAmounts(100_000.01, CONSTRUCTION_PAYMENT_PLAN)).toEqual([10_000, 20_000, 30_000, 20_000, 20_000.01]);
  });

  it("classifies overdue and partially paid milestone balances", () => {
    const today = new Date("2026-10-06T12:00:00");
    expect(getMilestoneState(20_000, 0, "2026-10-05", today)).toBe("Overdue");
    expect(getMilestoneState(20_000, 5_000, "2026-10-05", today)).toBe("Overdue");
    expect(getMilestoneState(20_000, 5_000, "2026-10-07", today)).toBe("Partially paid");
    expect(getMilestoneState(20_000, 20_000, null, today)).toBe("Paid");
  });

  it("allows booking edits only to admins and the assigned caller", () => {
    expect(canManageDeal(true, "caller-a", "caller-b")).toBe(true);
    expect(canManageDeal(false, "caller-a", "caller-a")).toBe(true);
    expect(canManageDeal(false, "caller-a", "caller-b")).toBe(false);
  });

  it("quotes CSV cells, doubles embedded quotes, and neutralizes spreadsheet formulas", () => {
    expect(toDealsCsv([["Client", "Notes"], ["Asha", '=HYPERLINK("bad")']]))
      .toBe('"Client","Notes"\r\n"Asha","\'=HYPERLINK(""bad"")"');
  });
});
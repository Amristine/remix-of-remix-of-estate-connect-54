import { describe, it, expect } from "vitest";
import { normalizePhone, followUpBucket } from "@/lib/crm";

describe("Indian phone validation", () => {
  it("accepts 10 digits", () => expect(normalizePhone("9876543210")).toBe("9876543210"));
  it("accepts +91 prefix", () => expect(normalizePhone("+91 98765-43210")).toBe("9876543210"));
  it("rejects 9 digits", () => expect(normalizePhone("987654321")).toBeNull());
  it("rejects numbers not starting 6-9", () => expect(normalizePhone("1234567890")).toBeNull());
});

describe("follow-up buckets", () => {
  const now = new Date("2026-10-03T12:00:00");
  it("overdue yesterday", () => expect(followUpBucket("2026-10-02T15:00:00", now)).toBe("overdue"));
  it("today later", () => expect(followUpBucket("2026-10-03T16:00:00", now)).toBe("today"));
  it("upcoming tomorrow", () => expect(followUpBucket("2026-10-04T10:00:00", now)).toBe("upcoming"));
});

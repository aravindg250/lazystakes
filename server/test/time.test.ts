import { describe, expect, it } from "vitest";
import {
  addDays, dayStartUtc, deadlineUtc, localDate, monthOf, scheduledDates, weekdayOf,
} from "../src/time";

describe("deadlines", () => {
  it("11:59 pm New York in summer is 03:59 UTC the next day (EDT)", () => {
    expect(deadlineUtc("2026-07-15", "23:59", "America/New_York").toISOString())
      .toBe("2026-07-16T03:59:59.999Z");
  });

  it("11:59 pm New York in winter is 04:59 UTC the next day (EST)", () => {
    expect(deadlineUtc("2026-11-02", "23:59", "America/New_York").toISOString())
      .toBe("2026-11-03T04:59:59.999Z");
  });

  it("handles the spring-forward day (a 23-hour day)", () => {
    expect(deadlineUtc("2026-03-08", "23:59", "America/New_York").toISOString())
      .toBe("2026-03-09T03:59:59.999Z");
    expect(dayStartUtc("2026-03-08", "America/New_York").toISOString())
      .toBe("2026-03-08T05:00:00.000Z");
  });

  it("handles the fall-back day (a 25-hour day)", () => {
    expect(dayStartUtc("2026-11-01", "America/New_York").toISOString())
      .toBe("2026-11-01T04:00:00.000Z");
    expect(deadlineUtc("2026-11-01", "23:59", "America/New_York").toISOString())
      .toBe("2026-11-02T04:59:59.999Z");
  });

  it("accepts Postgres time strings with seconds", () => {
    expect(deadlineUtc("2026-07-15", "23:59:00", "America/New_York").toISOString())
      .toBe("2026-07-16T03:59:59.999Z");
  });

  it("works east of UTC", () => {
    expect(deadlineUtc("2026-10-16", "23:59", "Asia/Tokyo").toISOString())
      .toBe("2026-10-16T14:59:59.999Z");
  });
});

describe("local dates", () => {
  it("uses the commitment's zone, not UTC", () => {
    // 03:00 UTC on the 16th is still the evening of the 15th in New York.
    expect(localDate("America/New_York", new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-15");
    expect(localDate("Asia/Tokyo", new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-16");
  });

  it("does calendar arithmetic across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(monthOf("2026-10-31")).toBe("2026-10-01");
  });

  it("uses ISO weekdays, Monday = 1", () => {
    expect(weekdayOf("2026-10-12")).toBe(1); // Monday
    expect(weekdayOf("2026-10-16")).toBe(5); // Friday
    expect(weekdayOf("2026-10-18")).toBe(7); // Sunday
  });

  it("lists scheduled dates in a window", () => {
    // Thu 15th through Sat 17th, scheduled Mon/Wed/Fri → only Fri 16th.
    expect(scheduledDates("2026-10-15", 2, [1, 3, 5])).toEqual(["2026-10-16"]);
  });
});

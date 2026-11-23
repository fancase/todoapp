import { describe, expect, it } from "vitest";
import {
  formatDateKo,
  formatRangeKo,
  parseJumpDate,
  shiftDate,
  todayInSeoul,
  weekRangeOf,
  weekdayKo,
} from "./date";

describe("todayInSeoul", () => {
  it("uses Asia/Seoul, not UTC", () => {
    // 2026-11-23T16:30:00Z is already 2026-11-24 01:30 in Seoul.
    expect(todayInSeoul(new Date("2026-11-23T16:30:00Z"))).toBe("2026-11-24");
    expect(todayInSeoul(new Date("2026-11-23T14:59:00Z"))).toBe("2026-11-23");
  });
});

describe("shiftDate", () => {
  it("crosses month and year boundaries without timezone drift", () => {
    expect(shiftDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatting", () => {
  it("formats Korean dates with weekday", () => {
    expect(weekdayKo("2026-11-23")).toBe("월");
    expect(formatDateKo("2026-11-23")).toBe("2026년 11월 23일 (월)");
    expect(formatRangeKo("2026-11-23", "2026-11-29")).toBe("2026.11.23 ~ 2026.11.29");
  });
});

describe("weekRangeOf", () => {
  it("returns Monday to Sunday", () => {
    expect(weekRangeOf("2026-11-23")).toEqual({ start: "2026-11-23", end: "2026-11-29" });
    expect(weekRangeOf("2026-11-29")).toEqual({ start: "2026-11-23", end: "2026-11-29" });
    expect(weekRangeOf("2026-11-26")).toEqual({ start: "2026-11-23", end: "2026-11-29" });
  });
});

describe("parseJumpDate", () => {
  it("accepts real dates in 2000-2100 only", () => {
    expect(parseJumpDate("2026-11-25")).toBe("2026-11-25");
    expect(parseJumpDate("2000-01-01")).toBe("2000-01-01");
    expect(parseJumpDate("2100-12-31")).toBe("2100-12-31");
    expect(parseJumpDate("2028-02-29")).toBe("2028-02-29");
  });
  it("rejects half-typed years, impossible dates and junk", () => {
    expect(parseJumpDate("0020-11-25")).toBeNull();
    expect(parseJumpDate("1999-12-31")).toBeNull();
    expect(parseJumpDate("2101-01-01")).toBeNull();
    expect(parseJumpDate("2026-02-30")).toBeNull();
    expect(parseJumpDate("2027-02-29")).toBeNull();
    expect(parseJumpDate("2026-13-01")).toBeNull();
    expect(parseJumpDate("")).toBeNull();
    expect(parseJumpDate("2026-1-1")).toBeNull();
  });
});

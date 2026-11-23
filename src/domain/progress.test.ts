import { describe, expect, it } from "vitest";
import { displayPercent, weeklyProgress, yearlyProgress } from "./progress";

describe("weeklyProgress", () => {
  it("is 0 with no todos", () => expect(weeklyProgress(0, 0)).toBe(0));
  it("is 25 / 50 / 100 for 1, 2, 4 of 4 done", () => {
    expect(weeklyProgress(1, 4)).toBe(25);
    expect(weeklyProgress(2, 4)).toBe(50);
    expect(weeklyProgress(4, 4)).toBe(100);
  });
  it("keeps the raw value", () => expect(weeklyProgress(1, 3)).toBeCloseTo(33.3333, 4));
});

describe("yearlyProgress", () => {
  it("is 0 with no plans", () => expect(yearlyProgress([])).toBe(0));
  it("averages 100 and 0 to 50", () => expect(yearlyProgress([100, 0])).toBe(50));
  it("averages raw values before rounding", () => {
    const avg = yearlyProgress([weeklyProgress(1, 3), weeklyProgress(1, 3), weeklyProgress(2, 3)]);
    expect(avg).toBeCloseTo(44.4444, 4);
    expect(displayPercent(avg)).toBe(44);
  });
  it("counts a 0-todo plan as 0", () => {
    expect(yearlyProgress([weeklyProgress(1, 1), weeklyProgress(0, 0)])).toBe(50);
  });
});

describe("displayPercent", () => {
  it("rounds only for display", () => {
    expect(displayPercent(33.333)).toBe(33);
    expect(displayPercent(66.667)).toBe(67);
  });
});

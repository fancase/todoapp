import { describe, expect, it } from "vitest";
import {
  goalCreateSchema,
  isRealDate,
  todoCreateSchema,
  todoPatchSchema,
  weeklyPlanCreateSchema,
} from "./schemas";

const oid = "507f1f77bcf86cd799439011";

describe("isRealDate", () => {
  it.each(["2026-01-01", "2024-02-29", "2026-12-31"])("accepts %s", (d) =>
    expect(isRealDate(d)).toBe(true),
  );
  it.each([
    "2026-02-30",
    "2026-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-1-1",
    "20260101",
    "",
    "2026-01-01T00:00",
  ])("rejects %s", (d) => expect(isRealDate(d)).toBe(false));
});

describe("todoCreateSchema", () => {
  it("defaults status to todo and weeklyPlanId to null, trims title", () => {
    const r = todoCreateSchema.parse({ title: "  a  ", date: "2026-03-01" });
    expect(r).toEqual({ title: "a", date: "2026-03-01", status: "todo", weeklyPlanId: null });
  });
  it("rejects blank title, missing date, bad status, bad id, bad date, long title", () => {
    const ok = { title: "a", date: "2026-03-01" };
    expect(todoCreateSchema.safeParse({ title: "   ", date: ok.date }).success).toBe(false);
    expect(todoCreateSchema.safeParse({ title: "a" }).success).toBe(false);
    expect(todoCreateSchema.safeParse({ ...ok, status: "x" }).success).toBe(false);
    expect(todoCreateSchema.safeParse({ ...ok, weeklyPlanId: "zz" }).success).toBe(false);
    expect(todoCreateSchema.safeParse({ ...ok, date: "2026-02-30" }).success).toBe(false);
    expect(todoCreateSchema.safeParse({ ...ok, title: "x".repeat(201) }).success).toBe(false);
  });
  it("rejects unknown fields", () => {
    const ok = { title: "a", date: "2026-03-01" };
    expect(todoCreateSchema.safeParse({ ...ok, _id: oid }).success).toBe(false);
    expect(todoCreateSchema.safeParse({ ...ok, createdAt: "x" }).success).toBe(false);
  });
});

describe("todoPatchSchema", () => {
  it("allows partial and null weeklyPlanId, rejects empty and unknown", () => {
    expect(todoPatchSchema.safeParse({ status: "done" }).success).toBe(true);
    expect(todoPatchSchema.safeParse({ weeklyPlanId: null }).success).toBe(true);
    expect(todoPatchSchema.safeParse({}).success).toBe(false);
    expect(todoPatchSchema.safeParse({ id: oid }).success).toBe(false);
  });
});

describe("weeklyPlanCreateSchema", () => {
  const base = { title: "w", startDate: "2026-03-02", endDate: "2026-03-08" };
  it("accepts start <= end, including equal", () => {
    expect(weeklyPlanCreateSchema.safeParse(base).success).toBe(true);
    expect(weeklyPlanCreateSchema.safeParse({ ...base, endDate: base.startDate }).success).toBe(true);
  });
  it("rejects start > end", () => {
    expect(weeklyPlanCreateSchema.safeParse({ ...base, endDate: "2026-03-01" }).success).toBe(false);
  });
});

describe("goalCreateSchema", () => {
  it("validates year as an integer in range", () => {
    expect(goalCreateSchema.safeParse({ title: "g", year: 2026 }).success).toBe(true);
    expect(goalCreateSchema.safeParse({ title: "g", year: 2026.5 }).success).toBe(false);
    expect(goalCreateSchema.safeParse({ title: "g", year: "2026" }).success).toBe(false);
    expect(goalCreateSchema.safeParse({ title: "", year: 2026 }).success).toBe(false);
  });
});

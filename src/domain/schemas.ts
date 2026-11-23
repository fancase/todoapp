import { z } from "zod";

export const TODO_STATUSES = ["todo", "doing", "done"] as const;

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isObjectIdString(value: string): boolean {
  return OBJECT_ID_RE.test(value);
}

/** Strict real calendar date, e.g. rejects 2026-02-30. */
export function isRealDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1) return false;
  const dt = new Date(Date.UTC(2000, mo - 1, d));
  dt.setUTCFullYear(y, mo - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const title = z
  .string()
  .trim()
  .min(1, "제목을 입력하세요")
  .max(200, "제목은 200자 이하여야 합니다");

const dateString = z.string().refine(isRealDate, "YYYY-MM-DD 형식의 올바른 날짜여야 합니다");

const objectIdString = z.string().refine(isObjectIdString, "올바른 ID 형식이 아닙니다");

const status = z.enum(TODO_STATUSES);

const year = z.number().int().min(2000).max(2100);

export const todoCreateSchema = z.strictObject({
  title,
  date: dateString,
  status: status.default("todo"),
  weeklyPlanId: objectIdString.nullable().default(null),
});

export const todoPatchSchema = z
  .strictObject({
    title,
    date: dateString,
    status,
    weeklyPlanId: objectIdString.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다");

export const todoQuerySchema = z.strictObject({ date: dateString.optional() });

export const weeklyPlanCreateSchema = z
  .strictObject({
    title,
    startDate: dateString,
    endDate: dateString,
    goalId: objectIdString.nullable().default(null),
  })
  .refine((v) => v.startDate <= v.endDate, {
    path: ["endDate"],
    message: "종료일은 시작일 이후여야 합니다",
  });

// The start <= end check on PATCH runs in the server against the merged stored values.
export const weeklyPlanPatchSchema = z
  .strictObject({
    title,
    startDate: dateString,
    endDate: dateString,
    goalId: objectIdString.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다");

export const goalCreateSchema = z.strictObject({ title, year });

export const goalPatchSchema = z
  .strictObject({ title, year })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "수정할 필드가 없습니다");

export type TodoCreateInput = z.infer<typeof todoCreateSchema>;
export type TodoPatchInput = z.infer<typeof todoPatchSchema>;
export type WeeklyPlanCreateInput = z.infer<typeof weeklyPlanCreateSchema>;
export type WeeklyPlanPatchInput = z.infer<typeof weeklyPlanPatchSchema>;
export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type GoalPatchInput = z.infer<typeof goalPatchSchema>;

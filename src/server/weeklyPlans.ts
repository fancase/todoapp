import "server-only";
import type { ObjectId } from "mongodb";
import type { WeeklyPlan, WeeklyPlanDetailDto, WeeklyPlanDto } from "@/domain/types";
import type { WeeklyPlanCreateInput, WeeklyPlanPatchInput } from "@/domain/schemas";
import { getClient } from "@/lib/db";
import { ApiError, badRequest, notFound, parseId } from "./http";
import {
  goalsCol,
  plansCol,
  TODO_SORT,
  todosCol,
  toTodoDtos,
  toWeeklyPlanDtos,
} from "./dto";

async function assertGoalExists(userId: ObjectId, id: ObjectId): Promise<void> {
  if (!(await goalsCol().findOne({ userId, _id: id }, { projection: { _id: 1 } }))) {
    throw badRequest("연결하려는 1년 목표가 존재하지 않습니다");
  }
}

function assertRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new ApiError(400, "VALIDATION_ERROR", "입력값이 올바르지 않습니다", [
      { field: "endDate", message: "종료일은 시작일 이후여야 합니다" },
    ]);
  }
}

export async function listWeeklyPlans(userId: ObjectId): Promise<WeeklyPlanDto[]> {
  const plans = await plansCol().find({ userId }).sort({ startDate: 1, _id: 1 }).toArray();
  return toWeeklyPlanDtos(userId, plans);
}

export async function getWeeklyPlan(userId: ObjectId, id: ObjectId): Promise<WeeklyPlanDetailDto> {
  const plan = await plansCol().findOne({ userId, _id: id });
  if (!plan) throw notFound("주간 계획");
  const [[dto], todos] = await Promise.all([
    toWeeklyPlanDtos(userId, [plan]),
    todosCol().find({ userId, weeklyPlanId: id }).sort(TODO_SORT).toArray(),
  ]);
  return { ...dto, todos: await toTodoDtos(userId, todos) };
}

export async function createWeeklyPlan(userId: ObjectId, input: WeeklyPlanCreateInput): Promise<WeeklyPlanDto> {
  const goalId = input.goalId ? parseId(input.goalId) : null;
  if (goalId) await assertGoalExists(userId, goalId);
  const now = new Date();
  const doc: Omit<WeeklyPlan, "_id"> = {
    userId,
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    goalId,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await plansCol().insertOne(doc as WeeklyPlan);
  const [dto] = await toWeeklyPlanDtos(userId, [{ ...doc, _id: insertedId }]);
  return dto;
}

export async function updateWeeklyPlan(
  userId: ObjectId,
  id: ObjectId,
  patch: WeeklyPlanPatchInput,
): Promise<WeeklyPlanDto> {
  const existing = await plansCol().findOne({ userId, _id: id });
  if (!existing) throw notFound("주간 계획");
  assertRange(patch.startDate ?? existing.startDate, patch.endDate ?? existing.endDate);
  const set: Partial<WeeklyPlan> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.startDate !== undefined) set.startDate = patch.startDate;
  if (patch.endDate !== undefined) set.endDate = patch.endDate;
  if (patch.goalId !== undefined) {
    const goalId = patch.goalId ? parseId(patch.goalId) : null;
    if (goalId) await assertGoalExists(userId, goalId);
    set.goalId = goalId;
  }
  const updated = await plansCol().findOneAndUpdate(
    { userId, _id: id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!updated) throw notFound("주간 계획");
  const [dto] = await toWeeklyPlanDtos(userId, [updated]);
  return dto;
}

/** Deletes the plan and unlinks its todos atomically. Returns the number of unlinked todos. */
export async function deleteWeeklyPlan(userId: ObjectId, id: ObjectId): Promise<number> {
  return getClient().withSession((session) =>
    session.withTransaction(async () => {
      const unlinked = await todosCol().updateMany(
        { userId, weeklyPlanId: id },
        { $set: { weeklyPlanId: null, updatedAt: new Date() } },
        { session },
      );
      const deleted = await plansCol().deleteOne({ userId, _id: id }, { session });
      if (deleted.deletedCount === 0) throw notFound("주간 계획");
      return unlinked.modifiedCount;
    }),
  );
}

import "server-only";
import type { ObjectId } from "mongodb";
import type { Goal, GoalDetailDto, GoalDto } from "@/domain/types";
import type { GoalCreateInput, GoalPatchInput } from "@/domain/schemas";
import { getClient } from "@/lib/db";
import { notFound } from "./http";
import { goalsCol, plansCol, toGoalDtos } from "./dto";

export async function listGoals(): Promise<GoalDto[]> {
  const goals = await goalsCol().find({}).sort({ year: -1, createdAt: 1, _id: 1 }).toArray();
  return (await toGoalDtos(goals)).dtos;
}

export async function getGoal(id: ObjectId): Promise<GoalDetailDto> {
  const goal = await goalsCol().findOne({ _id: id });
  if (!goal) throw notFound("1년 목표");
  const { dtos, plansByGoal } = await toGoalDtos([goal]);
  return { ...dtos[0], weeklyPlans: plansByGoal.get(id.toHexString()) ?? [] };
}

export async function createGoal(input: GoalCreateInput): Promise<GoalDto> {
  const now = new Date();
  const doc: Omit<Goal, "_id"> = {
    title: input.title,
    year: input.year,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await goalsCol().insertOne(doc as Goal);
  return (await toGoalDtos([{ ...doc, _id: insertedId }])).dtos[0];
}

export async function updateGoal(id: ObjectId, patch: GoalPatchInput): Promise<GoalDto> {
  const set: Partial<Goal> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.year !== undefined) set.year = patch.year;
  const updated = await goalsCol().findOneAndUpdate(
    { _id: id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!updated) throw notFound("1년 목표");
  return (await toGoalDtos([updated])).dtos[0];
}

/** Deletes the goal and unlinks its weekly plans atomically. Returns the number of unlinked plans. */
export async function deleteGoal(id: ObjectId): Promise<number> {
  return getClient().withSession((session) =>
    session.withTransaction(async () => {
      const unlinked = await plansCol().updateMany(
        { goalId: id },
        { $set: { goalId: null, updatedAt: new Date() } },
        { session },
      );
      const deleted = await goalsCol().deleteOne({ _id: id }, { session });
      if (deleted.deletedCount === 0) throw notFound("1년 목표");
      return unlinked.modifiedCount;
    }),
  );
}

import "server-only";
import type { ObjectId } from "mongodb";
import type { Goal, GoalDetailDto, GoalDto } from "@/domain/types";
import type { GoalCreateInput, GoalPatchInput } from "@/domain/schemas";
import { getClient } from "@/lib/db";
import { notFound } from "./http";
import { goalsCol, plansCol, toGoalDtos } from "./dto";

export async function listGoals(userId: ObjectId): Promise<GoalDto[]> {
  const goals = await goalsCol().find({ userId }).sort({ year: -1, createdAt: 1, _id: 1 }).toArray();
  return (await toGoalDtos(userId, goals)).dtos;
}

export async function getGoal(userId: ObjectId, id: ObjectId): Promise<GoalDetailDto> {
  const goal = await goalsCol().findOne({ userId, _id: id });
  if (!goal) throw notFound("1년 목표");
  const { dtos, plansByGoal } = await toGoalDtos(userId, [goal]);
  return { ...dtos[0], weeklyPlans: plansByGoal.get(id.toHexString()) ?? [] };
}

export async function createGoal(userId: ObjectId, input: GoalCreateInput): Promise<GoalDto> {
  const now = new Date();
  const doc: Omit<Goal, "_id"> = {
    userId,
    title: input.title,
    year: input.year,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await goalsCol().insertOne(doc as Goal);
  return (await toGoalDtos(userId, [{ ...doc, _id: insertedId }])).dtos[0];
}

export async function updateGoal(userId: ObjectId, id: ObjectId, patch: GoalPatchInput): Promise<GoalDto> {
  const set: Partial<Goal> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.year !== undefined) set.year = patch.year;
  const updated = await goalsCol().findOneAndUpdate(
    { userId, _id: id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!updated) throw notFound("1년 목표");
  return (await toGoalDtos(userId, [updated])).dtos[0];
}

/** Deletes the goal and unlinks its weekly plans atomically. Returns the number of unlinked plans. */
export async function deleteGoal(userId: ObjectId, id: ObjectId): Promise<number> {
  return getClient().withSession((session) =>
    session.withTransaction(async () => {
      const unlinked = await plansCol().updateMany(
        { userId, goalId: id },
        { $set: { goalId: null, updatedAt: new Date() } },
        { session },
      );
      const deleted = await goalsCol().deleteOne({ userId, _id: id }, { session });
      if (deleted.deletedCount === 0) throw notFound("1년 목표");
      return unlinked.modifiedCount;
    }),
  );
}

import { connection } from "next/server";
import { goalCreateSchema } from "@/domain/schemas";
import { createGoal, listGoals } from "@/server/goals";
import { handle, json, parseWith, readJson } from "@/server/http";
import { requireUserId } from "@/server/session";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const userId = await requireUserId(req);
    return json({ goals: await listGoals(userId) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const input = parseWith(goalCreateSchema, await readJson(req));
    return json({ goal: await createGoal(userId, input) }, 201);
  });
}

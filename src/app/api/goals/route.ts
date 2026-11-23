import { connection } from "next/server";
import { goalCreateSchema } from "@/domain/schemas";
import { createGoal, listGoals } from "@/server/goals";
import { handle, json, parseWith, readJson } from "@/server/http";

export async function GET() {
  await connection();
  return handle(async () => json({ goals: await listGoals() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const input = parseWith(goalCreateSchema, await readJson(req));
    return json({ goal: await createGoal(input) }, 201);
  });
}

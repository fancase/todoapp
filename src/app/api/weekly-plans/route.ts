import { connection } from "next/server";
import { weeklyPlanCreateSchema } from "@/domain/schemas";
import { handle, json, parseWith, readJson } from "@/server/http";
import { requireUserId } from "@/server/session";
import { createWeeklyPlan, listWeeklyPlans } from "@/server/weeklyPlans";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const userId = await requireUserId(req);
    return json({ weeklyPlans: await listWeeklyPlans(userId) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const input = parseWith(weeklyPlanCreateSchema, await readJson(req));
    return json({ weeklyPlan: await createWeeklyPlan(userId, input) }, 201);
  });
}

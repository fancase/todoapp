import { connection } from "next/server";
import { weeklyPlanCreateSchema } from "@/domain/schemas";
import { handle, json, parseWith, readJson } from "@/server/http";
import { createWeeklyPlan, listWeeklyPlans } from "@/server/weeklyPlans";

export async function GET() {
  await connection();
  return handle(async () => json({ weeklyPlans: await listWeeklyPlans() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const input = parseWith(weeklyPlanCreateSchema, await readJson(req));
    return json({ weeklyPlan: await createWeeklyPlan(input) }, 201);
  });
}

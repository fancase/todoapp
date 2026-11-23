import { weeklyPlanPatchSchema } from "@/domain/schemas";
import { handle, json, parseId, parseWith, readJson } from "@/server/http";
import { deleteWeeklyPlan, getWeeklyPlan, updateWeeklyPlan } from "@/server/weeklyPlans";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => json({ weeklyPlan: await getWeeklyPlan(parseId((await params).id)) }));
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId((await params).id);
    const patch = parseWith(weeklyPlanPatchSchema, await readJson(req));
    return json({ weeklyPlan: await updateWeeklyPlan(id, patch) });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const unlinkedTodos = await deleteWeeklyPlan(parseId((await params).id));
    return json({ deleted: true, unlinkedTodos });
  });
}

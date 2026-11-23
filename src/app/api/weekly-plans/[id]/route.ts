import { weeklyPlanPatchSchema } from "@/domain/schemas";
import { handle, json, parseId, parseWith, readJson } from "@/server/http";
import { requireUserId } from "@/server/session";
import { deleteWeeklyPlan, getWeeklyPlan, updateWeeklyPlan } from "@/server/weeklyPlans";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    return json({ weeklyPlan: await getWeeklyPlan(userId, parseId((await params).id)) });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const id = parseId((await params).id);
    const patch = parseWith(weeklyPlanPatchSchema, await readJson(req));
    return json({ weeklyPlan: await updateWeeklyPlan(userId, id, patch) });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const unlinkedTodos = await deleteWeeklyPlan(userId, parseId((await params).id));
    return json({ deleted: true, unlinkedTodos });
  });
}

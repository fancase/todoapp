import { goalPatchSchema } from "@/domain/schemas";
import { deleteGoal, getGoal, updateGoal } from "@/server/goals";
import { handle, json, parseId, parseWith, readJson } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => json({ goal: await getGoal(parseId((await params).id)) }));
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId((await params).id);
    const patch = parseWith(goalPatchSchema, await readJson(req));
    return json({ goal: await updateGoal(id, patch) });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const unlinkedWeeklyPlans = await deleteGoal(parseId((await params).id));
    return json({ deleted: true, unlinkedWeeklyPlans });
  });
}

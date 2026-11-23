import { goalPatchSchema } from "@/domain/schemas";
import { deleteGoal, getGoal, updateGoal } from "@/server/goals";
import { handle, json, parseId, parseWith, readJson } from "@/server/http";
import { requireUserId } from "@/server/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    return json({ goal: await getGoal(userId, parseId((await params).id)) });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const id = parseId((await params).id);
    const patch = parseWith(goalPatchSchema, await readJson(req));
    return json({ goal: await updateGoal(userId, id, patch) });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const unlinkedWeeklyPlans = await deleteGoal(userId, parseId((await params).id));
    return json({ deleted: true, unlinkedWeeklyPlans });
  });
}

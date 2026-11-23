import { todoPatchSchema } from "@/domain/schemas";
import { handle, json, parseId, parseWith, readJson } from "@/server/http";
import { requireUserId } from "@/server/session";
import { deleteTodo, updateTodo } from "@/server/todos";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const id = parseId((await params).id);
    const patch = parseWith(todoPatchSchema, await readJson(req));
    return json({ todo: await updateTodo(userId, id, patch) });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const userId = await requireUserId(req);
    await deleteTodo(userId, parseId((await params).id));
    return json({ deleted: true });
  });
}

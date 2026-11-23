import { todoPatchSchema } from "@/domain/schemas";
import { handle, json, parseId, parseWith, readJson } from "@/server/http";
import { deleteTodo, updateTodo } from "@/server/todos";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId((await params).id);
    const patch = parseWith(todoPatchSchema, await readJson(req));
    return json({ todo: await updateTodo(id, patch) });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await deleteTodo(parseId((await params).id));
    return json({ deleted: true });
  });
}

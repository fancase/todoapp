import { todoCreateSchema, todoQuerySchema } from "@/domain/schemas";
import { handle, json, parseWith, readJson } from "@/server/http";
import { requireUserId } from "@/server/session";
import { createTodo, listTodos } from "@/server/todos";

export async function GET(req: Request) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const date = new URL(req.url).searchParams.get("date") ?? undefined;
    const q = parseWith(todoQuerySchema, { date });
    return json({ todos: await listTodos(userId, q.date) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId(req);
    const input = parseWith(todoCreateSchema, await readJson(req));
    return json({ todo: await createTodo(userId, input) }, 201);
  });
}

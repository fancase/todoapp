import "server-only";
import type { ObjectId } from "mongodb";
import type { Todo, TodoDto } from "@/domain/types";
import type { TodoCreateInput, TodoPatchInput } from "@/domain/schemas";
import { badRequest, notFound, parseId } from "./http";
import { plansCol, TODO_SORT, todosCol, toTodoDtos } from "./dto";

async function assertPlanExists(id: ObjectId): Promise<void> {
  if (!(await plansCol().findOne({ _id: id }, { projection: { _id: 1 } }))) {
    throw badRequest("연결하려는 주간 계획이 존재하지 않습니다");
  }
}

export async function listTodos(date?: string): Promise<TodoDto[]> {
  const todos = await todosCol()
    .find(date ? { date } : {})
    .sort(TODO_SORT)
    .toArray();
  return toTodoDtos(todos);
}

export async function createTodo(input: TodoCreateInput): Promise<TodoDto> {
  const weeklyPlanId = input.weeklyPlanId ? parseId(input.weeklyPlanId) : null;
  if (weeklyPlanId) await assertPlanExists(weeklyPlanId);
  const now = new Date();
  const doc: Omit<Todo, "_id"> = {
    title: input.title,
    date: input.date,
    status: input.status,
    weeklyPlanId,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await todosCol().insertOne(doc as Todo);
  const [dto] = await toTodoDtos([{ ...doc, _id: insertedId }]);
  return dto;
}

export async function updateTodo(id: ObjectId, patch: TodoPatchInput): Promise<TodoDto> {
  const set: Partial<Todo> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.weeklyPlanId !== undefined) {
    const planId = patch.weeklyPlanId ? parseId(patch.weeklyPlanId) : null;
    if (planId) await assertPlanExists(planId);
    set.weeklyPlanId = planId;
  }
  const updated = await todosCol().findOneAndUpdate(
    { _id: id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!updated) throw notFound("할 일");
  const [dto] = await toTodoDtos([updated]);
  return dto;
}

export async function deleteTodo(id: ObjectId): Promise<void> {
  const r = await todosCol().deleteOne({ _id: id });
  if (r.deletedCount === 0) throw notFound("할 일");
}

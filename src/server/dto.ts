import "server-only";
import type { ObjectId } from "mongodb";
import { weeklyProgress, yearlyProgress } from "@/domain/progress";
import type {
  Goal,
  GoalDto,
  ParentGoalSummary,
  Todo,
  TodoDto,
  WeeklyPlan,
  WeeklyPlanDto,
  WeeklyProgress,
} from "@/domain/types";
import { getDb } from "@/lib/db";

export const todosCol = () => getDb().collection<Todo>("todos");
export const plansCol = () => getDb().collection<WeeklyPlan>("weeklyPlans");
export const goalsCol = () => getDb().collection<Goal>("goals");

const unique = (ids: (ObjectId | null)[]): ObjectId[] => {
  const map = new Map<string, ObjectId>();
  for (const id of ids) if (id) map.set(id.toHexString(), id);
  return [...map.values()];
};

/** One aggregation for all given plans (no N+1). */
export async function loadWeeklyProgress(
  userId: ObjectId,
  planIds: ObjectId[],
): Promise<Map<string, WeeklyProgress>> {
  const result = new Map<string, WeeklyProgress>();
  if (planIds.length === 0) return result;
  const rows = await todosCol()
    .aggregate<{ _id: ObjectId; total: number; done: number }>([
      { $match: { userId, weeklyPlanId: { $in: planIds } } },
      {
        $group: {
          _id: "$weeklyPlanId",
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  for (const r of rows) {
    result.set(r._id.toHexString(), {
      done: r.done,
      total: r.total,
      percent: weeklyProgress(r.done, r.total),
    });
  }
  return result;
}

const emptyProgress = (): WeeklyProgress => ({ done: 0, total: 0, percent: 0 });

export function toTodoDto(todo: Todo, plan: WeeklyPlan | undefined): TodoDto {
  return {
    id: todo._id.toHexString(),
    title: todo.title,
    date: todo.date,
    status: todo.status,
    weeklyPlanId: todo.weeklyPlanId?.toHexString() ?? null,
    weeklyPlan: plan
      ? { id: plan._id.toHexString(), title: plan.title, startDate: plan.startDate, endDate: plan.endDate }
      : null,
    outOfPlanRange: plan ? todo.date < plan.startDate || todo.date > plan.endDate : false,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/** Batch-load parent plans for todos (one query). */
export async function toTodoDtos(userId: ObjectId, todos: Todo[]): Promise<TodoDto[]> {
  const planIds = unique(todos.map((t) => t.weeklyPlanId));
  const plans = planIds.length ? await plansCol().find({ userId, _id: { $in: planIds } }).toArray() : [];
  const byId = new Map(plans.map((p) => [p._id.toHexString(), p]));
  return todos.map((t) => toTodoDto(t, t.weeklyPlanId ? byId.get(t.weeklyPlanId.toHexString()) : undefined));
}

export const TODO_SORT = { createdAt: 1, _id: 1 } as const;

function outsideYear(plan: WeeklyPlan, year: number): boolean {
  const y = String(year).padStart(4, "0");
  return plan.startDate.slice(0, 4) !== y || plan.endDate.slice(0, 4) !== y;
}

/** Batch-load progress and parent goals for plans (two queries). */
export async function toWeeklyPlanDtos(userId: ObjectId, plans: WeeklyPlan[]): Promise<WeeklyPlanDto[]> {
  const [progress, goals] = await Promise.all([
    loadWeeklyProgress(userId, plans.map((p) => p._id)),
    (async () => {
      const ids = unique(plans.map((p) => p.goalId));
      return ids.length ? goalsCol().find({ userId, _id: { $in: ids } }).toArray() : [];
    })(),
  ]);
  const goalById = new Map(goals.map((g) => [g._id.toHexString(), g]));
  return plans.map((p) => {
    const goal = p.goalId ? goalById.get(p.goalId.toHexString()) : undefined;
    const goalSummary: ParentGoalSummary | null = goal
      ? { id: goal._id.toHexString(), title: goal.title, year: goal.year }
      : null;
    return {
      id: p._id.toHexString(),
      title: p.title,
      startDate: p.startDate,
      endDate: p.endDate,
      goalId: p.goalId?.toHexString() ?? null,
      goal: goalSummary,
      progress: progress.get(p._id.toHexString()) ?? emptyProgress(),
      outOfGoalYear: goal ? outsideYear(p, goal.year) : false,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
}

/** Goals with raw yearly progress: 3 queries total regardless of count. */
export async function toGoalDtos(
  userId: ObjectId,
  goals: Goal[],
): Promise<{ dtos: GoalDto[]; plansByGoal: Map<string, WeeklyPlanDto[]> }> {
  const plans = goals.length
    ? await plansCol()
        .find({ userId, goalId: { $in: goals.map((g) => g._id) } })
        .sort({ startDate: 1, _id: 1 })
        .toArray()
    : [];
  const planDtos = await toWeeklyPlanDtos(userId, plans);
  const plansByGoal = new Map<string, WeeklyPlanDto[]>();
  for (const p of planDtos) {
    const list = plansByGoal.get(p.goalId!) ?? [];
    list.push(p);
    plansByGoal.set(p.goalId!, list);
  }
  const dtos = goals.map((g) => {
    const linked = plansByGoal.get(g._id.toHexString()) ?? [];
    return {
      id: g._id.toHexString(),
      title: g.title,
      year: g.year,
      progress: {
        percent: yearlyProgress(linked.map((p) => p.progress.percent)),
        weeklyPlanCount: linked.length,
      },
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    };
  });
  return { dtos, plansByGoal };
}

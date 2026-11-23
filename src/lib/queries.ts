import { useQuery, type QueryClient } from "@tanstack/react-query";
import type {
  GoalDetailDto,
  GoalDto,
  TodoDto,
  TodoStatus,
  WeeklyPlanDetailDto,
  WeeklyPlanDto,
} from "@/domain/types";
import { api, jsonBody, ApiRequestError } from "@/lib/api-client";

export const queryKeys = {
  todosAll: ["todos"] as const,
  todos: (date: string) => ["todos", date] as const,
  plansAll: ["weekly-plans"] as const,
  plan: (id: string) => ["weekly-plans", id] as const,
  goalsAll: ["goals"] as const,
  goal: (id: string) => ["goals", id] as const,
};

/** Retry transient failures once; never retry auth or client errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function invalidateAll(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.todosAll }),
    qc.invalidateQueries({ queryKey: queryKeys.plansAll }),
    qc.invalidateQueries({ queryKey: queryKeys.goalsAll }),
  ]).then(() => undefined);
}

// ---- reads ----

export const useTodos = (date: string) =>
  useQuery({
    queryKey: queryKeys.todos(date),
    queryFn: async () =>
      (await api<{ todos: TodoDto[] }>(`/api/todos?date=${encodeURIComponent(date)}`)).todos,
  });

export const useWeeklyPlans = () =>
  useQuery({
    queryKey: queryKeys.plansAll,
    queryFn: async () => (await api<{ weeklyPlans: WeeklyPlanDto[] }>("/api/weekly-plans")).weeklyPlans,
  });

export const useWeeklyPlan = (id: string) =>
  useQuery({
    queryKey: queryKeys.plan(id),
    queryFn: async () =>
      (await api<{ weeklyPlan: WeeklyPlanDetailDto }>(`/api/weekly-plans/${id}`)).weeklyPlan,
  });

export const useGoals = () =>
  useQuery({
    queryKey: queryKeys.goalsAll,
    queryFn: async () => (await api<{ goals: GoalDto[] }>("/api/goals")).goals,
  });

export const useGoal = (id: string) =>
  useQuery({
    queryKey: queryKeys.goal(id),
    queryFn: async () => (await api<{ goal: GoalDetailDto }>(`/api/goals/${id}`)).goal,
  });

// ---- writes ----

export interface TodoInput {
  title: string;
  date: string;
  status?: TodoStatus;
  weeklyPlanId: string | null;
}

export const todoApi = {
  create: (input: TodoInput) =>
    api<{ todo: TodoDto }>("/api/todos", { method: "POST", ...jsonBody(input) }),
  patch: (id: string, patch: Partial<TodoInput>) =>
    api<{ todo: TodoDto }>(`/api/todos/${id}`, { method: "PATCH", ...jsonBody(patch) }),
  remove: (id: string) => api<{ deleted: boolean }>(`/api/todos/${id}`, { method: "DELETE" }),
};

export interface WeeklyPlanInput {
  title: string;
  startDate: string;
  endDate: string;
  goalId: string | null;
}

export const weeklyPlanApi = {
  create: (input: WeeklyPlanInput) =>
    api<{ weeklyPlan: WeeklyPlanDto }>("/api/weekly-plans", { method: "POST", ...jsonBody(input) }),
  patch: (id: string, patch: Partial<WeeklyPlanInput>) =>
    api<{ weeklyPlan: WeeklyPlanDto }>(`/api/weekly-plans/${id}`, {
      method: "PATCH",
      ...jsonBody(patch),
    }),
  remove: (id: string) =>
    api<{ deleted: boolean; unlinkedTodos: number }>(`/api/weekly-plans/${id}`, {
      method: "DELETE",
    }),
};

export interface GoalInput {
  title: string;
  year: number;
}

export const goalApi = {
  create: (input: GoalInput) =>
    api<{ goal: GoalDto }>("/api/goals", { method: "POST", ...jsonBody(input) }),
  patch: (id: string, patch: Partial<GoalInput>) =>
    api<{ goal: GoalDto }>(`/api/goals/${id}`, { method: "PATCH", ...jsonBody(patch) }),
  remove: (id: string) =>
    api<{ deleted: boolean; unlinkedWeeklyPlans: number }>(`/api/goals/${id}`, {
      method: "DELETE",
    }),
};

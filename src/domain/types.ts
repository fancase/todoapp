import type { ObjectId } from "mongodb";

export type TodoStatus = "todo" | "doing" | "done";

export interface User {
  _id: ObjectId;
  githubId: number;
  username: string;
  avatarUrl: string;
  createdAt: Date;
  lastLoginAt: Date;
}

/** Server-side session. `_id` is the random session id carried in the signed cookie. */
export interface SessionDoc {
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface CurrentUserDto {
  id: string;
  username: string;
  avatarUrl: string;
}

export interface Goal {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeeklyPlan {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  goalId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Todo {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  date: string; // YYYY-MM-DD (no timezone shift)
  status: TodoStatus;
  weeklyPlanId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---- API response DTOs (ObjectIds as string `id`, Dates as ISO strings) ----

export interface ParentWeeklyPlanSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

export interface TodoDto {
  id: string;
  title: string;
  date: string;
  status: TodoStatus;
  weeklyPlanId: string | null;
  weeklyPlan: ParentWeeklyPlanSummary | null;
  /** true when linked to a weekly plan and `date` is outside its range (UI warning). */
  outOfPlanRange: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Raw (unrounded) weekly progress. `percent` is 0-100; round only for display. */
export interface WeeklyProgress {
  done: number;
  total: number;
  percent: number;
}

export interface ParentGoalSummary {
  id: string;
  title: string;
  year: number;
}

export interface WeeklyPlanDto {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  goalId: string | null;
  goal: ParentGoalSummary | null;
  progress: WeeklyProgress;
  /** true when linked to a goal and the range is not fully inside the goal's year (UI warning). */
  outOfGoalYear: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyPlanDetailDto extends WeeklyPlanDto {
  todos: TodoDto[];
}

/** Raw (unrounded) yearly progress: mean of linked weekly plans' raw percents. */
export interface GoalProgress {
  percent: number;
  weeklyPlanCount: number;
}

export interface GoalDto {
  id: string;
  title: string;
  year: number;
  progress: GoalProgress;
  createdAt: string;
  updatedAt: string;
}

export interface GoalDetailDto extends GoalDto {
  weeklyPlans: WeeklyPlanDto[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

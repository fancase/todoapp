import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Collection, ObjectId, type Db } from "mongodb";

vi.mock("server-only", () => ({}));
// Route handlers call connection(), which throws outside a Next request scope.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

let replSet: MongoMemoryReplSet;

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
type Routes = Record<string, Handler>;
let todosRoute: Routes;
let todoIdRoute: Routes;
let plansRoute: Routes;
let planIdRoute: Routes;
let goalsRoute: Routes;
let goalIdRoute: Routes;
let getDb: () => Db;
let closeClient: () => Promise<void>;

const MISSING = "507f1f77bcf86cd799439011";

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri();
  process.env.MONGODB_DB = "todo_test";
  process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
  const db = await import("@/lib/db");
  getDb = db.getDb;
  closeClient = () => db.getClient().close();
  todosRoute = (await import("@/app/api/todos/route")) as unknown as Routes;
  todoIdRoute = (await import("@/app/api/todos/[id]/route")) as unknown as Routes;
  plansRoute = (await import("@/app/api/weekly-plans/route")) as unknown as Routes;
  planIdRoute = (await import("@/app/api/weekly-plans/[id]/route")) as unknown as Routes;
  goalsRoute = (await import("@/app/api/goals/route")) as unknown as Routes;
  goalIdRoute = (await import("@/app/api/goals/[id]/route")) as unknown as Routes;
});

afterAll(async () => {
  await closeClient?.();
  await replSet?.stop();
});

beforeEach(async () => {
  const db = getDb();
  await Promise.all(["todos", "weeklyPlans", "goals"].map((c) => db.collection(c).deleteMany({})));
});

afterEach(() => vi.restoreAllMocks());

interface CallOpts {
  body?: unknown;
  id?: string;
  query?: string;
  raw?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function call(route: Routes, method: string, opts: CallOpts = {}): Promise<{ status: number; body: Json }> {
  const req = new Request(`http://localhost/api/x${opts.query ?? ""}`, {
    method,
    headers: { "content-type": "application/json" },
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const res = await route[method](req, { params: Promise.resolve({ id: opts.id ?? "" }) });
  return { status: res.status, body: await res.json() };
}

const mkGoal = async (year = 2026, title = "goal"): Promise<Json> =>
  (await call(goalsRoute, "POST", { body: { title, year } })).body.goal;
const mkPlan = async (extra: Record<string, unknown> = {}): Promise<Json> =>
  (
    await call(plansRoute, "POST", {
      body: { title: "plan", startDate: "2026-03-02", endDate: "2026-03-08", ...extra },
    })
  ).body.weeklyPlan;
const mkTodo = async (extra: Record<string, unknown> = {}): Promise<Json> =>
  (await call(todosRoute, "POST", { body: { title: "t", date: "2026-03-02", ...extra } })).body.todo;

describe("todos", () => {
  it("creates with default status todo (AC2) and returns an id string", async () => {
    const r = await call(todosRoute, "POST", { body: { title: " 장보기 ", date: "2026-03-02" } });
    expect(r.status).toBe(201);
    expect(r.body.todo).toMatchObject({
      title: "장보기",
      status: "todo",
      weeklyPlanId: null,
      weeklyPlan: null,
      outOfPlanRange: false,
    });
    expect(r.body.todo.id).toMatch(/^[0-9a-f]{24}$/);
    expect(r.body.todo._id).toBeUndefined();
  });

  it("rejects missing title/date, bad status, impossible date (AC1, AC2)", async () => {
    for (const body of [
      { date: "2026-03-02" },
      { title: "a" },
      { title: "   ", date: "2026-03-02" },
      { title: "a", date: "2026-02-30" },
      { title: "a", date: "2026-03-02", status: "paused" },
    ]) {
      const r = await call(todosRoute, "POST", { body });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
      expect(r.body.error.details.length).toBeGreaterThan(0);
    }
    expect((await call(todosRoute, "POST", { raw: "{nope" })).status).toBe(400);
    expect(await getDb().collection("todos").countDocuments()).toBe(0);
  });

  it("rejects client-set _id/createdAt/id", async () => {
    for (const extra of [{ _id: MISSING }, { createdAt: "2000-01-01" }, { id: "x" }]) {
      const r = await call(todosRoute, "POST", { body: { title: "a", date: "2026-03-02", ...extra } });
      expect(r.status).toBe(400);
    }
    const t = await mkTodo();
    expect((await call(todoIdRoute, "PATCH", { id: t.id, body: { createdAt: "2000-01-01" } })).status).toBe(400);
  });

  it("lists by date sorted by createdAt asc with a stable _id tie-break", async () => {
    const a = await mkTodo({ title: "a" });
    const b = await mkTodo({ title: "b" });
    const c = await mkTodo({ title: "c", date: "2026-03-03" });
    const same = new Date("2026-01-01T00:00:00Z");
    await getDb().collection("todos").updateMany({}, { $set: { createdAt: same } });
    const r = await call(todosRoute, "GET", { query: "?date=2026-03-02" });
    expect(r.body.todos.map((t: Json) => t.id)).toEqual([a.id, b.id].sort());
    expect(r.body.todos.some((t: Json) => t.id === c.id)).toBe(false);
    await getDb()
      .collection("todos")
      .updateOne({ _id: new ObjectId(b.id) }, { $set: { createdAt: new Date("2025-01-01T00:00:00Z") } });
    const r2 = await call(todosRoute, "GET", { query: "?date=2026-03-02" });
    expect(r2.body.todos[0].id).toBe(b.id);
  });

  it("rejects a bad date query", async () => {
    expect((await call(todosRoute, "GET", { query: "?date=2026-02-30" })).status).toBe(400);
  });

  it("PATCH updates fields; 404 for missing and 400 for malformed ids", async () => {
    const t = await mkTodo();
    const r = await call(todoIdRoute, "PATCH", { id: t.id, body: { status: "doing", title: "new" } });
    expect(r.status).toBe(200);
    expect(r.body.todo).toMatchObject({ status: "doing", title: "new" });
    expect((await call(todoIdRoute, "PATCH", { id: t.id, body: { status: "bad" } })).status).toBe(400);
    expect((await call(todoIdRoute, "PATCH", { id: MISSING, body: { status: "done" } })).status).toBe(404);
    expect((await call(todoIdRoute, "PATCH", { id: "nope", body: { status: "done" } })).status).toBe(400);
    expect((await call(todoIdRoute, "DELETE", { id: "nope" })).status).toBe(400);
    expect((await call(todoIdRoute, "DELETE", { id: MISSING })).status).toBe(404);
  });

  it("linking to a nonexistent weekly plan is 400 on create and PATCH; null unlinks", async () => {
    const created = await call(todosRoute, "POST", {
      body: { title: "a", date: "2026-03-02", weeklyPlanId: MISSING },
    });
    expect(created.status).toBe(400);
    const plan = await mkPlan();
    const t = await mkTodo({ weeklyPlanId: plan.id });
    expect(t.weeklyPlan).toMatchObject({ id: plan.id, title: "plan" });
    expect((await call(todoIdRoute, "PATCH", { id: t.id, body: { weeklyPlanId: MISSING } })).status).toBe(400);
    const r = await call(todoIdRoute, "PATCH", { id: t.id, body: { weeklyPlanId: null } });
    expect(r.body.todo.weeklyPlanId).toBeNull();
  });

  it("flags todos outside the plan range but still saves them", async () => {
    const plan = await mkPlan();
    expect((await mkTodo({ weeklyPlanId: plan.id, date: "2026-04-01" })).outOfPlanRange).toBe(true);
    expect((await mkTodo({ weeklyPlanId: plan.id, date: "2026-03-08" })).outOfPlanRange).toBe(false);
  });

  it("DELETE removes the todo and progress recalculates (AC3)", async () => {
    const plan = await mkPlan();
    const t1 = await mkTodo({ weeklyPlanId: plan.id, status: "done" });
    await mkTodo({ weeklyPlanId: plan.id });
    expect((await call(planIdRoute, "GET", { id: plan.id })).body.weeklyPlan.progress.percent).toBe(50);
    expect((await call(todoIdRoute, "DELETE", { id: t1.id })).status).toBe(200);
    const after = await call(planIdRoute, "GET", { id: plan.id });
    expect(after.body.weeklyPlan.progress).toEqual({ done: 0, total: 1, percent: 0 });
  });
});

describe("progress via API (AC6-8)", () => {
  it("weekly: 1 of 4 done is 25, 2 of 4 is 50, no todos is 0", async () => {
    const empty = await mkPlan({ title: "empty" });
    expect(empty.progress).toEqual({ done: 0, total: 0, percent: 0 });
    const plan = await mkPlan();
    const todos: Json[] = [];
    for (let i = 0; i < 4; i++) todos.push(await mkTodo({ weeklyPlanId: plan.id }));
    await call(todoIdRoute, "PATCH", { id: todos[0].id, body: { status: "done" } });
    let r = await call(planIdRoute, "GET", { id: plan.id });
    expect(r.body.weeklyPlan.progress.percent).toBe(25);
    await call(todoIdRoute, "PATCH", { id: todos[1].id, body: { status: "done" } });
    r = await call(planIdRoute, "GET", { id: plan.id });
    expect(r.body.weeklyPlan.progress).toEqual({ done: 2, total: 4, percent: 50 });
    const list = (await call(plansRoute, "GET")).body.weeklyPlans as Json[];
    expect(list.find((p) => p.id === plan.id).progress.percent).toBe(50);
    expect(list.find((p) => p.id === empty.id).progress.percent).toBe(0);
  });

  it("yearly: 100% and 0% plans give 50; 0-todo plans count as 0; no plans is 0; raw not rounded", async () => {
    const goal = await mkGoal();
    expect(goal.progress).toEqual({ percent: 0, weeklyPlanCount: 0 });
    const p1 = await mkPlan({ goalId: goal.id });
    await mkPlan({ goalId: goal.id });
    await mkTodo({ weeklyPlanId: p1.id, status: "done" });
    let g = (await call(goalIdRoute, "GET", { id: goal.id })).body.goal;
    expect(g.progress).toEqual({ percent: 50, weeklyPlanCount: 2 });
    expect(g.weeklyPlans).toHaveLength(2);
    expect(g.weeklyPlans.find((p: Json) => p.id === p1.id).progress.percent).toBe(100);

    const p3 = await mkPlan({ goalId: goal.id });
    await mkTodo({ weeklyPlanId: p3.id, status: "done" });
    await mkTodo({ weeklyPlanId: p3.id });
    await mkTodo({ weeklyPlanId: p3.id });
    g = (await call(goalIdRoute, "GET", { id: goal.id })).body.goal;
    expect(g.progress.percent).toBeCloseTo((100 + 0 + 100 / 3) / 3, 8);
    const list = (await call(goalsRoute, "GET")).body.goals;
    expect(list[0].progress.percent).toBeCloseTo((100 + 0 + 100 / 3) / 3, 8);
  });

  it("plan detail includes sorted todos and goal; flags plans outside the goal year", async () => {
    const goal = await mkGoal(2026, "G");
    const plan = await mkPlan({ goalId: goal.id, startDate: "2025-12-29", endDate: "2026-01-04" });
    expect(plan.outOfGoalYear).toBe(true);
    expect(plan.goal).toEqual({ id: goal.id, title: "G", year: 2026 });
    await mkTodo({ weeklyPlanId: plan.id, title: "first" });
    await mkTodo({ weeklyPlanId: plan.id, title: "second" });
    const d = (await call(planIdRoute, "GET", { id: plan.id })).body.weeklyPlan;
    expect(d.todos.map((t: Json) => t.title)).toEqual(["first", "second"]);
    expect(d.todos[0].weeklyPlan.id).toBe(plan.id);
  });
});

describe("weekly plans validation", () => {
  it("rejects start > end on create and on PATCH merged with stored values", async () => {
    const bad = { title: "p", startDate: "2026-03-09", endDate: "2026-03-01" };
    expect((await call(plansRoute, "POST", { body: bad })).status).toBe(400);
    const plan = await mkPlan();
    expect((await call(planIdRoute, "PATCH", { id: plan.id, body: { endDate: "2026-03-01" } })).status).toBe(400);
    expect((await call(planIdRoute, "PATCH", { id: plan.id, body: { startDate: "2026-04-01" } })).status).toBe(400);
    const ok = await call(planIdRoute, "PATCH", {
      id: plan.id,
      body: { startDate: "2026-03-01", endDate: "2026-03-20" },
    });
    expect(ok.status).toBe(200);
  });

  it("links: nonexistent goal 400, malformed 400, missing plan 404", async () => {
    const base = { title: "p", startDate: "2026-03-01", endDate: "2026-03-02" };
    expect((await call(plansRoute, "POST", { body: { ...base, goalId: MISSING } })).status).toBe(400);
    const plan = await mkPlan();
    expect((await call(planIdRoute, "PATCH", { id: plan.id, body: { goalId: MISSING } })).status).toBe(400);
    expect((await call(planIdRoute, "PATCH", { id: plan.id, body: { goalId: "bad" } })).status).toBe(400);
    expect((await call(planIdRoute, "GET", { id: MISSING })).status).toBe(404);
    expect((await call(planIdRoute, "GET", { id: "bad" })).status).toBe(400);
    expect((await call(planIdRoute, "DELETE", { id: MISSING })).status).toBe(404);
  });
});

describe("goals", () => {
  it("CRUD and validation", async () => {
    expect((await call(goalsRoute, "POST", { body: { title: "g", year: 1 } })).status).toBe(400);
    expect((await call(goalsRoute, "POST", { body: { title: "", year: 2026 } })).status).toBe(400);
    const g = await mkGoal();
    const r = await call(goalIdRoute, "PATCH", { id: g.id, body: { title: "renamed", year: 2027 } });
    expect(r.body.goal).toMatchObject({ title: "renamed", year: 2027 });
    expect((await call(goalIdRoute, "GET", { id: MISSING })).status).toBe(404);
    expect((await call(goalIdRoute, "PATCH", { id: MISSING, body: { title: "x" } })).status).toBe(404);
    expect((await call(goalIdRoute, "DELETE", { id: "bad" })).status).toBe(400);
  });
});

describe("deletion unlinks children (AC9, AC10)", () => {
  it("deleting a weekly plan keeps todos with weeklyPlanId null", async () => {
    const plan = await mkPlan();
    const t = await mkTodo({ weeklyPlanId: plan.id });
    const r = await call(planIdRoute, "DELETE", { id: plan.id });
    expect(r.body).toEqual({ deleted: true, unlinkedTodos: 1 });
    expect((await call(planIdRoute, "GET", { id: plan.id })).status).toBe(404);
    const todos = (await call(todosRoute, "GET", { query: "?date=2026-03-02" })).body.todos;
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ id: t.id, weeklyPlanId: null, weeklyPlan: null });
  });

  it("deleting a goal keeps weekly plans with goalId null", async () => {
    const goal = await mkGoal();
    const plan = await mkPlan({ goalId: goal.id });
    const r = await call(goalIdRoute, "DELETE", { id: goal.id });
    expect(r.body).toEqual({ deleted: true, unlinkedWeeklyPlans: 1 });
    const p = (await call(planIdRoute, "GET", { id: plan.id })).body.weeklyPlan;
    expect(p).toMatchObject({ goalId: null, goal: null, outOfGoalYear: false });
  });

  it("a failed transaction leaves no partial change (plan delete)", async () => {
    const plan = await mkPlan();
    const t = await mkTodo({ weeklyPlanId: plan.id });
    vi.spyOn(Collection.prototype, "deleteOne").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call(planIdRoute, "DELETE", { id: plan.id });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("boom");
    expect(r.body.error.code).toBe("INTERNAL_ERROR");
    vi.restoreAllMocks();
    const d = (await call(planIdRoute, "GET", { id: plan.id })).body.weeklyPlan;
    expect(d.todos.map((x: Json) => x.id)).toEqual([t.id]);
  });

  it("a failed transaction leaves no partial change (goal delete)", async () => {
    const goal = await mkGoal();
    const plan = await mkPlan({ goalId: goal.id });
    vi.spyOn(Collection.prototype, "deleteOne").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call(goalIdRoute, "DELETE", { id: goal.id })).status).toBe(500);
    vi.restoreAllMocks();
    expect((await call(planIdRoute, "GET", { id: plan.id })).body.weeklyPlan.goalId).toBe(goal.id);
    expect((await call(goalIdRoute, "GET", { id: goal.id })).status).toBe(200);
  });
});

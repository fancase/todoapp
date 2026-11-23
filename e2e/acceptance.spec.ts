import { test, expect } from "./fixtures";
import { card, column, mouseDrag, uniq } from "./support/helpers";

// Acceptance criteria numbers refer to section 6 of .omc/plans/todo-app-v1.md.

test.describe("AC1: required fields", () => {
  test("shows a field error and saves nothing when the title is empty", async ({ page, data }) => {
    const date = "2031-01-11";
    await page.goto(`/board/${date}`);
    await page.getByTestId("add-todo-button").click();
    const dialog = page.getByTestId("todo-dialog");
    await dialog.getByTestId("todo-submit").click();
    await expect(dialog.getByTestId("field-error-title")).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await data.todos(date)).toHaveLength(0);
  });

  test("shows a field error and saves nothing when the date is empty", async ({ page, data }) => {
    const date = "2031-01-12";
    await page.goto(`/board/${date}`);
    await page.getByTestId("add-todo-button").click();
    const dialog = page.getByTestId("todo-dialog");
    await dialog.getByTestId("todo-title-input").fill(uniq("no-date"));
    await dialog.getByTestId("todo-date-input").fill("");
    await dialog.getByTestId("todo-submit").click();
    await expect(dialog.getByTestId("field-error-date")).toBeVisible();
    expect(await data.todos(date)).toHaveLength(0);
  });

  test("API rejects a todo without title or without date with 400", async ({ api }) => {
    const noTitle = await api.post("/api/todos", { data: { title: "", date: "2031-01-13" } });
    expect(noTitle.status()).toBe(400);
    const noDate = await api.post("/api/todos", { data: { title: "x" } });
    expect(noDate.status()).toBe(400);
  });
});

test.describe("AC2: default status and status validation", () => {
  test("a todo created in the UI lands in the todo column", async ({ page }) => {
    const title = uniq("default-status");
    await page.goto("/board/2031-01-14");
    await page.getByTestId("add-todo-button").click();
    const dialog = page.getByTestId("todo-dialog");
    await dialog.getByTestId("todo-title-input").fill(title);
    await dialog.getByTestId("todo-date-input").fill("2031-01-14");
    await dialog.getByTestId("todo-submit").click();
    await expect(column(page, "todo").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
  });

  test("a todo created through the API without a status is todo", async ({ api }) => {
    const res = await api.post("/api/todos", { data: { title: uniq("api-default"), date: "2031-01-14" } });
    expect(res.status()).toBe(201);
    expect((await res.json()).todo.status).toBe("todo");
  });

  test("API rejects a status outside todo, doing, done with 400 on create and on update", async ({ api, data }) => {
    const create = await api.post("/api/todos", { data: { title: "x", date: "2031-01-14", status: "blocked" } });
    expect(create.status()).toBe(400);
    const t = await data.todo(uniq("bad-status"), "2031-01-14");
    const patch = await api.patch(`/api/todos/${t.id}`, { data: { status: "archived" } });
    expect(patch.status()).toBe(400);
    expect((await data.todos("2031-01-14")).find((x) => x.id === t.id)?.status).toBe("todo");
  });
});

test.describe("AC3: delete needs confirmation and recalculates progress", () => {
  test("cancelling keeps the todo; confirming deletes it and recalculates the plan", async ({ page, data }) => {
    const date = "2031-02-03";
    const plan = await data.plan(uniq("ac3-plan"), null, "2031-02-03", "2031-02-09");
    const keep = uniq("ac3-keep");
    const drop = uniq("ac3-drop");
    await data.todo(keep, date, plan.id, "done");
    await data.todo(drop, date, plan.id);
    expect((await data.getPlan(plan.id)).progress.percent).toBe(50);

    await page.goto(`/board/${date}`);
    await card(page, drop).getByTestId("todo-delete").click();
    const dialog = page.getByTestId("delete-todo-dialog");
    await dialog.getByTestId("confirm-cancel").click();
    await expect(dialog).toBeHidden();
    await expect(card(page, drop)).toBeVisible();
    expect((await data.todos(date)).map((t) => t.title)).toContain(drop);

    await card(page, drop).getByTestId("todo-delete").click();
    await dialog.getByTestId("confirm-submit").click();
    await expect(card(page, drop)).toHaveCount(0);
    expect((await data.getPlan(plan.id)).progress).toMatchObject({ done: 1, total: 1, percent: 100 });

    await page.goto(`/weekly/${plan.id}`);
    await expect(page.getByTestId("weekly-detail").getByTestId("weekly-progress-value")).toHaveText("100%");
  });
});

test.describe("AC4: moving a card persists", () => {
  test("a dragged card keeps its column after reload", async ({ page, data }) => {
    const date = "2031-03-04";
    const title = uniq("ac4");
    const t = await data.todo(title, date);
    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, title), column(page, "doing"));
    await expect(column(page, "doing").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(card(page, title)).not.toHaveAttribute("data-pending", "true");
    await page.reload();
    await expect(column(page, "doing").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    expect((await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("doing");
  });

  test("dropping a card on its own column keeps it there without sending a request", async ({ page, data }) => {
    const date = "2031-03-05";
    const title = uniq("ac4-same");
    await data.todo(title, date);
    const patches: string[] = [];
    page.on("request", (r) => r.method() === "PATCH" && patches.push(r.url()));
    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, title), column(page, "todo"));
    await expect(column(page, "todo").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(page.getByTestId("drag-overlay")).toHaveCount(0);
    expect(patches).toEqual([]);
  });
});

test.describe("AC6 and AC7: weekly progress", () => {
  test("1 of 4 done is 25%, 2 of 4 done is 50%", async ({ page, data }) => {
    const date = "2031-04-02";
    const plan = await data.plan(uniq("ac6-plan"), null, "2031-04-01", "2031-04-07");
    const titles = [1, 2, 3, 4].map((n) => uniq(`ac6-${n}`));
    for (const t of titles) await data.todo(t, date, plan.id);

    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, titles[0]), column(page, "done"));
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: titles[0] })).toBeVisible();
    await expect(card(page, titles[0])).not.toHaveAttribute("data-pending", "true");
    await page.goto(`/weekly/${plan.id}`);
    await expect(page.getByTestId("weekly-detail").getByTestId("weekly-progress-value")).toHaveText("25%");

    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, titles[1]), column(page, "done"));
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: titles[1] })).toBeVisible();
    await expect(card(page, titles[1])).not.toHaveAttribute("data-pending", "true");
    await page.goto(`/weekly/${plan.id}`);
    await expect(page.getByTestId("weekly-detail").getByTestId("weekly-progress-value")).toHaveText("50%");
  });

  test("a plan with no linked todos shows 0%", async ({ page, data }) => {
    const plan = await data.plan(uniq("ac7-empty"));
    await page.goto(`/weekly/${plan.id}`);
    const detail = page.getByTestId("weekly-detail");
    await expect(detail.getByTestId("weekly-progress-value")).toHaveText("0%");
    await expect(detail.getByTestId("weekly-todos-empty")).toBeVisible();
  });
});

test.describe("AC8: goal progress", () => {
  test("plans at 100% and 0% give the goal 50%", async ({ page, data }) => {
    const goal = await data.goal(uniq("ac8-goal"), 2031);
    const full = await data.plan(uniq("ac8-full"), goal.id, "2031-05-05", "2031-05-11");
    await data.plan(uniq("ac8-zero"), goal.id, "2031-05-12", "2031-05-18");
    await data.todo(uniq("ac8-t"), "2031-05-06", full.id, "done");

    await page.goto(`/goals/${goal.id}`);
    await expect(page.getByTestId("goal-detail").getByTestId("goal-progress-value")).toHaveText("50%");
    await expect(page.getByTestId("goal-weekly-item")).toHaveCount(2);
    expect((await data.getGoal(goal.id)).progress.percent).toBe(50);
  });

  test("a goal with no weekly plans is 0%", async ({ page, data }) => {
    const goal = await data.goal(uniq("ac8-none"), 2031);
    await page.goto(`/goals/${goal.id}`);
    await expect(page.getByTestId("goal-detail").getByTestId("goal-progress-value")).toHaveText("0%");
    await expect(page.getByTestId("goal-plans-empty")).toBeVisible();
  });
});

test.describe("AC9 and AC10: deleting a parent unlinks children", () => {
  test("deleting a weekly plan keeps its todos and clears their link", async ({ page, data }) => {
    const date = "2031-06-03";
    const planTitle = uniq("ac9-plan");
    const plan = await data.plan(planTitle, null, "2031-06-02", "2031-06-08");
    const title = uniq("ac9-todo");
    const t = await data.todo(title, date, plan.id);

    await page.goto(`/board/${date}`);
    await expect(card(page, title).getByTestId("todo-plan-link")).toHaveText(planTitle);

    await page.goto("/weekly");
    await page.getByTestId("weekly-item").filter({ hasText: planTitle }).getByTestId("weekly-item-delete").click();
    const dialog = page.getByTestId("delete-weekly-dialog");
    await expect(dialog.getByTestId("delete-impact")).toContainText("1개");
    await dialog.getByTestId("confirm-submit").click();
    await expect(page.getByTestId("weekly-item").filter({ hasText: planTitle })).toHaveCount(0);

    await page.goto(`/board/${date}`);
    await expect(card(page, title)).toBeVisible();
    await expect(card(page, title).getByTestId("todo-plan-link")).toHaveCount(0);
    expect((await data.todos(date)).find((x) => x.id === t.id)?.weeklyPlanId).toBeNull();
  });

  test("deleting a goal keeps its weekly plans and clears their link", async ({ page, data }) => {
    const goalTitle = uniq("ac10-goal");
    const planTitle = uniq("ac10-plan");
    const goal = await data.goal(goalTitle, 2031);
    const plan = await data.plan(planTitle, goal.id, "2031-07-07", "2031-07-13");

    await page.goto("/goals");
    await page.getByTestId("goal-item").filter({ hasText: goalTitle }).getByTestId("goal-item-delete").click();
    const dialog = page.getByTestId("delete-goal-dialog");
    await expect(dialog.getByTestId("delete-impact")).toContainText("1개");
    await dialog.getByTestId("confirm-submit").click();
    await expect(page.getByTestId("goal-item").filter({ hasText: goalTitle })).toHaveCount(0);

    await page.goto("/weekly");
    const item = page.getByTestId("weekly-item").filter({ hasText: planTitle });
    await expect(item).toBeVisible();
    await expect(item.getByTestId("weekly-no-goal")).toBeVisible();
    expect((await data.getPlan(plan.id)).goalId).toBeNull();
  });
});

test.describe("warnings for out-of-range dates", () => {
  test("a todo dated outside its weekly plan shows a warning", async ({ page, data }) => {
    const plan = await data.plan(uniq("warn-plan"), null, "2031-08-04", "2031-08-10");
    const title = uniq("warn-todo");
    await data.todo(title, "2031-08-20", plan.id);
    await page.goto("/board/2031-08-20");
    await expect(card(page, title).getByTestId("out-of-plan-range-warning")).toBeVisible();
  });
});

import { test, expect } from "./fixtures";
import { card, column, createTodoViaUi, mouseDrag, selectByText, uniq } from "./support/helpers";

const DATE = "2030-03-05";

test("full flow: goal, weekly plans, todos, drag, progress, edit, delete, recalculation", async ({ page }) => {
  const goalTitle = uniq("flow-goal");
  const planA = uniq("flow-plan-A");
  const planB = uniq("flow-plan-B");
  const a = [1, 2, 3, 4].map((n) => uniq(`flow-a${n}`));
  const b = [1, 2].map((n) => uniq(`flow-b${n}`));

  await test.step("create a goal in the UI", async () => {
    await page.goto("/goals");
    await page.getByTestId("goal-create-button").click();
    const dialog = page.getByTestId("goal-dialog");
    await dialog.getByTestId("goal-title-input").fill(goalTitle);
    await dialog.getByTestId("goal-year-input").fill("2030");
    await dialog.getByTestId("goal-submit").click();
    await expect(dialog).toBeHidden();
    const item = page.getByTestId("goal-item").filter({ hasText: goalTitle });
    await expect(item.getByTestId("goal-progress-value")).toHaveText("0%");
  });

  await test.step("create weekly plan A from the weekly screen, linked to the goal", async () => {
    await page.goto("/weekly");
    await page.getByTestId("weekly-create-button").click();
    const dialog = page.getByTestId("weekly-dialog");
    await dialog.getByTestId("weekly-title-input").fill(planA);
    await dialog.getByTestId("weekly-start-input").fill("2030-03-04");
    await dialog.getByTestId("weekly-end-input").fill("2030-03-10");
    await selectByText(dialog.getByTestId("weekly-goal-select"), goalTitle);
    await dialog.getByTestId("weekly-submit").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("weekly-item").filter({ hasText: planA })).toBeVisible();
  });

  await test.step("create weekly plan B from the goal detail screen", async () => {
    await page.goto("/goals");
    await page.getByTestId("goal-item").filter({ hasText: goalTitle }).getByTestId("goal-item-link").click();
    await expect(page.getByTestId("goal-detail")).toBeVisible();
    await page.getByTestId("goal-add-weekly").click();
    const dialog = page.getByTestId("weekly-dialog");
    await dialog.getByTestId("weekly-title-input").fill(planB);
    await dialog.getByTestId("weekly-start-input").fill("2030-03-04");
    await dialog.getByTestId("weekly-end-input").fill("2030-03-10");
    await dialog.getByTestId("weekly-submit").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("goal-weekly-item").filter({ hasText: planB })).toBeVisible();
    await expect(page.getByTestId("goal-weekly-item")).toHaveCount(2);
  });

  await test.step("create todos in the UI and link them to plans", async () => {
    await page.goto(`/board/${DATE}`);
    for (const t of a) await createTodoViaUi(page, t, DATE, planA);
    for (const t of b) await createTodoViaUi(page, t, DATE, planB);
    await expect(column(page, "todo").getByTestId("todo-card")).toHaveCount(6);
    await expect(page.getByTestId("column-count-todo")).toHaveText("6");
  });

  const goalValue = async (expected: string) => {
    await page.goto("/goals");
    await expect(
      page.getByTestId("goal-item").filter({ hasText: goalTitle }).getByTestId("goal-progress-value"),
    ).toHaveText(expected);
  };
  const planValue = async (title: string, expected: string, caption: string) => {
    await page.goto("/weekly");
    const item = page.getByTestId("weekly-item").filter({ hasText: title });
    await expect(item.getByTestId("weekly-progress-value")).toHaveText(expected);
    await expect(item.getByTestId("weekly-progress-caption")).toHaveText(caption);
  };
  const moveTo = async (title: string, status: "todo" | "doing" | "done") => {
    await mouseDrag(page, card(page, title), column(page, status));
    await expect(column(page, status).getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(card(page, title)).not.toHaveAttribute("data-pending", "true");
  };

  await test.step("one plan-A todo to done: A 25%, goal 13% (mean of 25 and 0, rounded for display only)", async () => {
    await page.goto(`/board/${DATE}`);
    await moveTo(a[0], "done");
    await planValue(planA, "25%", "1/4 완료");
    await planValue(planB, "0%", "0/2 완료");
    await goalValue("13%");
  });

  await test.step("second plan-A todo to done: A 50%, goal 25%", async () => {
    await page.goto(`/board/${DATE}`);
    await moveTo(a[1], "done");
    await planValue(planA, "50%", "2/4 완료");
    await goalValue("25%");
  });

  await test.step("a todo moved to doing does not count as done", async () => {
    await page.goto(`/board/${DATE}`);
    await moveTo(a[2], "doing");
    await planValue(planA, "50%", "2/4 완료");
  });

  await test.step("finish both plan-B todos: B 100%, goal 75%", async () => {
    await page.goto(`/board/${DATE}`);
    for (const t of b) await moveTo(t, "done");
    await planValue(planB, "100%", "2/2 완료");
    await goalValue("75%");
  });

  await test.step("edit a todo title in the UI", async () => {
    await page.goto(`/board/${DATE}`);
    const renamed = `${a[3]}-edited`;
    await card(page, a[3]).getByTestId("todo-edit").click();
    const dialog = page.getByTestId("todo-dialog");
    await dialog.getByTestId("todo-title-input").fill(renamed);
    await dialog.getByTestId("todo-submit").click();
    await expect(dialog).toBeHidden();
    await expect(card(page, renamed)).toBeVisible();
    await expect(card(page, renamed)).toHaveAttribute("data-status", "todo");
  });

  await test.step("delete a done plan-A todo after confirmation: A 1/3 = 33%, goal 67%", async () => {
    await page.goto(`/board/${DATE}`);
    await card(page, a[0]).getByTestId("todo-delete").click();
    await page.getByTestId("delete-todo-dialog").getByTestId("confirm-submit").click();
    await expect(card(page, a[0])).toHaveCount(0);
    await planValue(planA, "33%", "1/3 완료");
    await goalValue("67%");
  });

  await test.step("state survives a reload and shows on the weekly detail", async () => {
    await page.goto("/weekly");
    await page.getByTestId("weekly-item").filter({ hasText: planA }).getByTestId("weekly-item-link").click();
    await expect(page.getByTestId("weekly-detail")).toBeVisible();
    await expect(page.getByTestId("weekly-detail").getByTestId("weekly-progress-value")).toHaveText("33%");
    await expect(page.getByTestId("weekly-todo-item")).toHaveCount(3);
    await page.reload();
    await expect(page.getByTestId("weekly-detail").getByTestId("weekly-progress-value")).toHaveText("33%");
  });
});

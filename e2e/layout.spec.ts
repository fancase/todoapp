import { test, expect } from "./fixtures";
import { noHorizontalScroll, uniq } from "./support/helpers";

// 360px is the narrowest phone width the app commits to. Each screen is checked twice: with ordinary
// titles, and with a 70-character unbroken title (a long URL or identifier) as the stress case.
const LONG = "W".repeat(70);
const variants = [
  { name: "ordinary titles", prefix: "Weekly review" },
  { name: "long unbroken titles", prefix: LONG },
];

for (const [vi, { name, prefix }] of variants.entries()) {
  test.describe(`no horizontal scroll at 360px, ${name}`, () => {
    test.use({ viewport: { width: 360, height: 780 } });
    const t = (s: string) => `${prefix}-${s}`;

    test("board, with a plan link and an open form dialog", async ({ page, data }) => {
      const date = `2033-01-0${4 + vi * 2}`;
      const plan = await data.plan(t("plan"), null, "2033-01-10", "2033-01-16");
      await data.todo(t("todo"), date, plan.id);
      await data.todo(uniq("short"), date, null, "doing");
      await data.todo(uniq("short-done"), date, null, "done");
      await page.goto(`/board/${date}`);
      await expect(page.getByTestId("todo-card")).toHaveCount(3);
      await noHorizontalScroll(page);

      await page.getByTestId("add-todo-button").click();
      await expect(page.getByTestId("todo-dialog")).toBeVisible();
      await noHorizontalScroll(page);
    });

    test("board delete confirmation dialog", async ({ page, data }) => {
      const date = `2033-01-0${5 + vi * 2}`;
      await data.todo(t("del"), date);
      await page.goto(`/board/${date}`);
      await page.getByTestId("todo-delete").click();
      await expect(page.getByTestId("delete-todo-dialog")).toBeVisible();
      await noHorizontalScroll(page);
    });

    test("weekly list and weekly detail", async ({ page, data }) => {
      const goal = await data.goal(t("goal"), 2033);
      const plan = await data.plan(t("weekly"), goal.id, "2033-02-07", "2033-02-13");
      await data.todo(t("wtodo"), "2033-02-08", plan.id);
      await data.todo(uniq("wtodo-out"), "2033-03-30", plan.id);
      await page.goto("/weekly");
      await expect(page.getByTestId("weekly-item").filter({ hasText: t("weekly") })).toBeVisible();
      await noHorizontalScroll(page);

      await page.goto(`/weekly/${plan.id}`);
      await expect(page.getByTestId("weekly-detail")).toBeVisible();
      await expect(page.getByTestId("weekly-todo-item")).toHaveCount(2);
      await noHorizontalScroll(page);
    });

    test("weekly form dialog and weekly delete dialog", async ({ page, data }) => {
      const plan = await data.plan(t("wdlg"), null, "2033-02-14", "2033-02-20");
      await page.goto("/weekly");
      await page.getByTestId("weekly-create-button").click();
      await expect(page.getByTestId("weekly-dialog")).toBeVisible();
      await noHorizontalScroll(page);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("weekly-dialog")).toBeHidden();
      await page.getByTestId("weekly-item").filter({ hasText: plan.title }).getByTestId("weekly-item-delete").click();
      await expect(page.getByTestId("delete-weekly-dialog")).toBeVisible();
      await noHorizontalScroll(page);
    });

    test("goals list and goal detail", async ({ page, data }) => {
      const goal = await data.goal(t("goal-list"), 2033);
      await data.plan(t("gplan"), goal.id, "2033-04-04", "2033-04-10");
      await data.plan(uniq("gplan-outside-year"), goal.id, "2034-01-01", "2034-01-07");
      await page.goto("/goals");
      await expect(page.getByTestId("goal-item").filter({ hasText: t("goal-list") })).toBeVisible();
      await noHorizontalScroll(page);

      await page.goto(`/goals/${goal.id}`);
      await expect(page.getByTestId("goal-detail")).toBeVisible();
      await expect(page.getByTestId("goal-weekly-item")).toHaveCount(2);
      await noHorizontalScroll(page);
    });

    test("goal form and goal delete dialogs", async ({ page, data }) => {
      const goal = await data.goal(t("gdlg"), 2033);
      await page.goto("/goals");
      await page.getByTestId("goal-create-button").click();
      await expect(page.getByTestId("goal-dialog")).toBeVisible();
      await noHorizontalScroll(page);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("goal-dialog")).toBeHidden();
      await page.getByTestId("goal-item").filter({ hasText: goal.title }).getByTestId("goal-item-delete").click();
      await expect(page.getByTestId("delete-goal-dialog")).toBeVisible();
      await noHorizontalScroll(page);
    });
  });
}

test.describe("no horizontal scroll at 360px, other screens", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("not-found goal and weekly detail", async ({ page }) => {
    await page.goto("/goals/64b000000000000000000001");
    await expect(page.getByTestId("not-found")).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto("/weekly/64b000000000000000000001");
    await expect(page.getByTestId("not-found")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("empty board", async ({ page }) => {
    await page.goto("/board/2033-12-31");
    await expect(page.getByTestId("board-empty")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test.describe("login screen", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("login page", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByTestId("login-form")).toBeVisible();
      await noHorizontalScroll(page);
    });
  });
});

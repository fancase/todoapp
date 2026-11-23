import { devices, type CDPSession, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { AUTH_FILE, card, column, mouseDrag, uniq } from "./support/helpers";

test.describe("AC5: failed save rolls the card back", () => {
  test("a PATCH 500 returns the card to its column, shows an error toast and keeps the server state", async ({
    page,
    data,
  }) => {
    const date = "2032-01-05";
    const title = uniq("rollback");
    const t = await data.todo(title, date);

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let patchSeen = 0;
    await page.route("**/api/todos/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patchSeen++;
      await gate;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL", message: "injected failure" } }),
      });
    });

    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, title), column(page, "done"));

    // Optimistic: the card is shown in the target column while the request is held.
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(card(page, title)).toHaveAttribute("data-pending", "true");

    release();
    await expect(column(page, "todo").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: title })).toHaveCount(0);
    await expect(page.getByTestId("toast-error")).toBeVisible();
    await expect(page.getByTestId("column-count-todo")).toHaveText("1");
    await expect(page.getByTestId("column-count-done")).toHaveText("0");
    expect(patchSeen).toBe(1);

    await page.reload();
    await expect(column(page, "todo").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    expect((await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("todo");
  });

  test("a 500 on one card does not disturb a card that saved fine", async ({ page, data }) => {
    const date = "2032-01-06";
    const bad = uniq("rb-bad");
    const good = uniq("rb-good");
    const badTodo = await data.todo(bad, date);
    await data.todo(good, date);
    await page.route(`**/api/todos/${badTodo.id}`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "x" } }) })
        : route.fallback(),
    );
    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, good), column(page, "done"));
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: good })).toBeVisible();
    await expect(card(page, good)).not.toHaveAttribute("data-pending", "true");
    await mouseDrag(page, card(page, bad), column(page, "doing"));
    await expect(page.getByTestId("toast-error")).toBeVisible();
    await expect(column(page, "todo").getByTestId("todo-card").filter({ hasText: bad })).toBeVisible();
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: good })).toBeVisible();
  });
});

test.describe("rapid consecutive drags", () => {
  test("the last drop wins for the same card", async ({ page, data }) => {
    const date = "2032-01-07";
    const title = uniq("rapid");
    const t = await data.todo(title, date);
    await page.goto(`/board/${date}`);
    await mouseDrag(page, card(page, title), column(page, "doing"));
    await mouseDrag(page, card(page, title), column(page, "done"));
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(card(page, title)).not.toHaveAttribute("data-pending", "true");
    await expect.poll(async () => (await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("done");
  });
});

const liveRegion = (page: Page) => page.locator('[id^="DndLiveRegion"]');

/**
 * Picks the card up with Space and moves it one column right with ArrowRight, waiting on dnd-kit's
 * screen-reader announcements (what a screen-reader user hears) between the keys.
 *
 * Observed: in roughly 1 of 10 runs an ArrowRight sent within milliseconds of the pick-up is ignored
 * and the drag stays on the original column (a human is far slower). In that case the page is reloaded
 * and the whole pick-up is retried, so the final-state assertions of the callers stay strict.
 */
async function pickUpAndMoveRight(page: Page, title: string, fromLabel: string, toLabel: string) {
  await page.waitForLoadState("networkidle");
  await expect(async () => {
    await card(page, title).getByTestId("todo-handle").focus();
    await page.keyboard.press("Space");
    await expect(liveRegion(page)).toContainText(`${fromLabel} 칸 위에 있습니다`);
    await page.keyboard.press("ArrowRight");
    try {
      await expect(liveRegion(page)).toContainText(`${toLabel} 칸 위에 있습니다`, { timeout: 1_000 });
    } catch (e) {
      await page.reload();
      await expect(card(page, title)).toBeVisible();
      throw e;
    }
  }).toPass({ timeout: 25_000 });
}

async function keyboardMove(page: Page, title: string, fromLabel: string, toLabel: string) {
  await pickUpAndMoveRight(page, title, fromLabel, toLabel);
  await page.keyboard.press("Space");
  await expect(liveRegion(page)).toContainText("칸으로 옮겼습니다");
}

test.describe("keyboard drag", () => {
  test("Space, ArrowRight, Space on the handle moves the card one column and saves it", async ({ page, data }) => {
    const date = "2032-02-02";
    const title = uniq("kbd");
    const t = await data.todo(title, date);
    await page.goto(`/board/${date}`);
    await keyboardMove(page, title, "할 일", "진행 중");
    await expect(column(page, "doing").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect(card(page, title)).not.toHaveAttribute("data-pending", "true");
    await expect.poll(async () => (await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("doing");

    await keyboardMove(page, title, "진행 중", "완료");
    await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    await expect.poll(async () => (await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("done");
  });

  test("Escape cancels a keyboard drag without changing anything", async ({ page, data }) => {
    const date = "2032-02-03";
    const title = uniq("kbd-esc");
    const t = await data.todo(title, date);
    await page.goto(`/board/${date}`);
    await pickUpAndMoveRight(page, title, "할 일", "진행 중");
    await page.keyboard.press("Escape");
    await expect(liveRegion(page)).toContainText("이동을 취소했습니다");
    await expect(page.getByTestId("drag-overlay")).toHaveCount(0);
    await expect(column(page, "todo").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    expect((await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("todo");
  });
});

test.describe("session expiry in the middle of a session", () => {
  test("an API 401 after the session is gone redirects to /login with a same-site next", async ({ page, context, data }) => {
    const date = "2032-03-10";
    const title = uniq("expiry");
    await data.todo(title, date);
    await page.goto(`/board/${date}`);
    // Wait for the data, not just the shell: the todo fetch must not be the request that hits the 401.
    await expect(card(page, title)).toBeVisible();

    await context.clearCookies();
    await page.getByTestId("date-next").click();

    await expect(page).toHaveURL(/\/login\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBe("/board/2032-03-11");
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("a failed mutation with an expired session also redirects to /login", async ({ page, context, data }) => {
    const date = "2032-03-12";
    const title = uniq("expiry-drag");
    await data.todo(title, date);
    await page.goto(`/board/${date}`);
    await expect(card(page, title)).toBeVisible();

    await context.clearCookies();
    await mouseDrag(page, card(page, title), column(page, "done"));

    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(`/board/${date}`);
  });
});

test.describe("touch drag on a phone viewport", () => {
  // Real touch events through the Chromium DevTools protocol on an emulated phone (hasTouch, isMobile).
  // This is emulation, not a physical device.
  async function touchDrag(page: Page, cdp: CDPSession, fromTestId: string, title: string, to: "doing" | "done") {
    const handle = card(page, title).getByTestId(fromTestId);
    await handle.scrollIntoViewIfNeeded();
    const s = (await handle.boundingBox())!;
    const target = column(page, to);
    const t = (await target.boundingBox())!;
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    // Long-press activation (220ms) happens by timer; wait for the drag overlay instead of sleeping.
    await expect(page.getByTestId("drag-overlay")).toBeVisible();
    const tx = t.x + t.width / 2;
    const ty = t.y + Math.min(t.height / 2, 60);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: sx + ((tx - sx) * i) / steps, y: sy + ((ty - sy) * i) / steps }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  test("a long-press drag moves a card to another column and saves it", async ({ browser, data }) => {
    const date = "2032-04-06";
    const title = uniq("touch");
    const t = await data.todo(title, date);
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      viewport: { width: 360, height: 1200 },
      storageState: AUTH_FILE,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    try {
      await page.goto(`/board/${date}`);
      await expect(card(page, title)).toBeVisible();
      await touchDrag(page, cdp, "todo-handle", title, "done");
      await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
      await expect(card(page, title)).not.toHaveAttribute("data-pending", "true");
      await expect.poll(async () => (await data.todos(date)).find((x) => x.id === t.id)?.status).toBe("done");
      await page.reload();
      await expect(column(page, "done").getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a quick swipe on a card does not start a drag", async ({ browser, data }) => {
    const date = "2032-04-07";
    const title = uniq("touch-swipe");
    const t = await data.todo(title, date);
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      viewport: { width: 360, height: 1200 },
      storageState: AUTH_FILE,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    try {
      await page.goto(`/board/${date}`);
      const body = card(page, title).getByTestId("todo-card-title");
      const b = (await body.boundingBox())!;
      const x = b.x + 10;
      const y = b.y + 5;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 60 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(page.getByTestId("drag-overlay")).toHaveCount(0);
      expect((await data.todos(date)).find((x2) => x2.id === t.id)?.status).toBe("todo");
    } finally {
      await context.close();
    }
  });
});

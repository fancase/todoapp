import { MongoClient } from "mongodb";
import { test, expect } from "./fixtures";
import { pickGithubUser, runState, signInAs, uniq } from "./support/helpers";

const anonymous = { cookies: [], origins: [] };

// The fake GitHub remembers which account signs in next; always leave it on the default owner.
test.afterEach(async () => {
  await pickGithubUser("e2e-owner");
});

async function usersCollection<T>(fn: (c: import("mongodb").Collection) => Promise<T>): Promise<T> {
  const s = runState();
  const client = await MongoClient.connect(s.mongoUri);
  try {
    return await fn(client.db(s.mongoDb).collection("users"));
  } finally {
    await client.close();
  }
}

test.describe("GitHub OAuth in a real browser", () => {
  test.use({ storageState: anonymous });

  test("login page -> GitHub -> back signed in, with username and avatar in the header", async ({ page }) => {
    await pickGithubUser("octo-browser");
    await page.goto("/login");
    await page.getByTestId("login-github").click();
    await expect(page).toHaveURL(/\/board\/\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("user-name")).toHaveText("octo-browser");
    const avatar = page.getByTestId("user-avatar");
    await expect(avatar).toBeVisible();
    await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test("the GitHub profile is stored in the database", async ({ page }) => {
    await pickGithubUser("stored-user");
    await page.goto("/login");
    await page.getByTestId("login-github").click();
    await expect(page.getByTestId("user-name")).toHaveText("stored-user");
    const doc = await usersCollection((c) => c.findOne({ username: "stored-user" }));
    expect(doc).toMatchObject({ username: "stored-user" });
    expect(typeof doc?.githubId).toBe("number");
    expect(String(doc?.avatarUrl)).toMatch(/\/avatar\/stored-user\.svg$/);
  });

  test("signing in again with the same account reuses the same user", async ({ page, context }) => {
    await pickGithubUser("repeat-user");
    for (let i = 0; i < 2; i++) {
      await context.clearCookies();
      await page.goto("/login");
      await page.getByTestId("login-github").click();
      await expect(page.getByTestId("user-name")).toHaveText("repeat-user");
    }
    expect(await usersCollection((c) => c.countDocuments({ username: "repeat-user" }))).toBe(1);
  });

  test("a tampered state is refused and nobody is signed in", async ({ page }) => {
    // Start the flow without following it, so the browser holds a real state cookie but is not signed in.
    const start = await page.request.get("/auth/github", { maxRedirects: 0 });
    expect(start.status()).toBe(307);
    await page.goto("/auth/github/callback?code=forged&state=not-the-state");
    await expect(page).toHaveURL(/\/login\?error=state$/);
    await expect(page.getByTestId("login-error")).toContainText("다시 시도");
    expect((await page.request.get("/api/goals")).status()).toBe(401);
  });

  test("a callback with no prior login attempt is refused", async ({ page }) => {
    await page.goto("/auth/github/callback?code=whatever&state=whatever");
    await expect(page).toHaveURL(/\/login\?error=state$/);
    await expect(page.getByTestId("login-error")).toBeVisible();
  });

  test("declining on GitHub shows a message and stays signed out", async ({ page }) => {
    await fetch(`${runState().githubUrl}/__deny`, { method: "POST" });
    await page.goto("/login");
    await page.getByTestId("login-github").click();
    await expect(page).toHaveURL(/\/login\?error=denied$/);
    await expect(page.getByTestId("login-error")).toContainText("취소");
    expect((await page.request.get("/api/goals")).status()).toBe(401);
  });

  for (const what of ["token", "profile"] as const) {
    test(`a GitHub ${what} failure shows a message and creates no session`, async ({ page }) => {
      await fetch(`${runState().githubUrl}/__break?what=${what}`, { method: "POST" });
      await page.goto("/login");
      await page.getByTestId("login-github").click();
      await expect(page).toHaveURL(/\/login\?error=github$/);
      await expect(page.getByTestId("login-error")).toContainText("GitHub");
      expect((await page.request.get("/api/goals")).status()).toBe(401);
    });
  }

  test("a callback URL cannot be replayed once it has been used", async ({ playwright }) => {
    const s = runState();
    const ctx = await playwright.request.newContext({
      baseURL: s.baseURL,
      extraHTTPHeaders: { Origin: s.baseURL },
      storageState: { cookies: [], origins: [] },
    });
    try {
      // Walk the redirect chain one hop at a time so the exact callback URL is in hand.
      const step1 = await ctx.get("/auth/github", { maxRedirects: 0 });
      expect(step1.status()).toBe(307);
      const step2 = await ctx.get(step1.headers()["location"], { maxRedirects: 0 });
      expect(step2.status()).toBe(302);
      const callbackUrl = step2.headers()["location"];
      expect(callbackUrl).toContain("/auth/github/callback");

      const first = await ctx.get(callbackUrl, { maxRedirects: 0 });
      expect(first.status()).toBe(307);
      expect(first.headers()["set-cookie"]).toContain("session=");
      expect((await ctx.get("/api/goals")).status()).toBe(200);

      // Replaying the very same URL: the one-time state cookie was cleared, so it is refused.
      const replay = await ctx.get(callbackUrl, { maxRedirects: 0 });
      expect(replay.status()).toBe(307);
      expect(new URL(replay.headers()["location"]).search).toBe("?error=state");
      expect(replay.headers()["set-cookie"] ?? "").not.toMatch(/session=[^;]+;(?!.*Max-Age=0)/);
    } finally {
      await ctx.dispose();
    }
  });
});

test.describe("logout removes the session for good", () => {
  test.use({ storageState: anonymous });

  test("the cookie copied before logout no longer works afterwards", async ({ page, context, playwright }) => {
    await pickGithubUser("logout-user");
    await page.goto("/login");
    await page.getByTestId("login-github").click();
    await expect(page.getByTestId("user-name")).toHaveText("logout-user");

    const before = (await context.cookies()).find((c) => c.name === "session")!;
    expect(before).toBeTruthy();
    expect(before.httpOnly).toBe(true);
    expect((await page.request.get("/api/goals")).status()).toBe(200);

    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login/);
    expect((await context.cookies()).find((c) => c.name === "session")).toBeUndefined();

    // An attacker who copied the cookie earlier replays it: the server-side session is gone.
    const s = runState();
    const replay = await playwright.request.newContext({
      baseURL: s.baseURL,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { Cookie: `session=${before.value}`, Origin: s.baseURL },
    });
    expect((await replay.get("/api/goals")).status()).toBe(401);
    expect((await replay.get("/api/todos?date=2030-01-01")).status()).toBe(401);
    expect((await replay.post("/api/goals", { data: { title: "x", year: 2030 } })).status()).toBe(401);
    await replay.dispose();
  });
});

test.describe("each GitHub account sees only its own todos", () => {
  test("two users cannot read, change or delete each other's data", async ({ playwright }) => {
    const alice = await signInAs(playwright, "alice");
    const bob = await signInAs(playwright, "bob");
    try {
      const mark = uniq("iso");
      const date = "2031-05-05";
      const goalA = (await (await alice.post("/api/goals", { data: { title: `${mark}-goal`, year: 2031 } })).json()).goal;
      const planA = (
        await (
          await alice.post("/api/weekly-plans", {
            data: { title: `${mark}-plan`, startDate: "2031-05-05", endDate: "2031-05-11", goalId: goalA.id },
          })
        ).json()
      ).weeklyPlan;
      const todoA = (
        await (
          await alice.post("/api/todos", { data: { title: `${mark}-todo`, date, weeklyPlanId: planA.id } })
        ).json()
      ).todo;

      // Alice sees hers.
      expect(((await (await alice.get(`/api/todos?date=${date}`)).json()).todos as { id: string }[]).map((t) => t.id)).toEqual([todoA.id]);

      // Bob sees none of it, in any list.
      expect((await (await bob.get(`/api/todos?date=${date}`)).json()).todos).toEqual([]);
      const bobPlans = (await (await bob.get("/api/weekly-plans")).json()).weeklyPlans as { title: string }[];
      expect(bobPlans.some((p) => p.title.startsWith(mark))).toBe(false);
      const bobGoals = (await (await bob.get("/api/goals")).json()).goals as { title: string }[];
      expect(bobGoals.some((g) => g.title.startsWith(mark))).toBe(false);

      // Direct access by id is 404 for read, update and delete.
      expect((await bob.get(`/api/weekly-plans/${planA.id}`)).status()).toBe(404);
      expect((await bob.get(`/api/goals/${goalA.id}`)).status()).toBe(404);
      expect((await bob.patch(`/api/todos/${todoA.id}`, { data: { title: "hacked" } })).status()).toBe(404);
      expect((await bob.patch(`/api/weekly-plans/${planA.id}`, { data: { title: "hacked" } })).status()).toBe(404);
      expect((await bob.patch(`/api/goals/${goalA.id}`, { data: { title: "hacked" } })).status()).toBe(404);
      expect((await bob.delete(`/api/todos/${todoA.id}`)).status()).toBe(404);
      expect((await bob.delete(`/api/weekly-plans/${planA.id}`)).status()).toBe(404);
      expect((await bob.delete(`/api/goals/${goalA.id}`)).status()).toBe(404);

      // Bob cannot attach his todos to Alice's plan.
      const link = await bob.post("/api/todos", { data: { title: "sneaky", date, weeklyPlanId: planA.id } });
      expect(link.status()).toBe(400);

      // Everything of Alice's is untouched.
      const after = (await (await alice.get(`/api/weekly-plans/${planA.id}`)).json()).weeklyPlan;
      expect(after.title).toBe(`${mark}-plan`);
      expect(after.todos.map((t: { title: string }) => t.title)).toEqual([`${mark}-todo`]);
      expect((await (await alice.get(`/api/goals/${goalA.id}`)).json()).goal.title).toBe(`${mark}-goal`);
    } finally {
      await alice.dispose();
      await bob.dispose();
    }
  });

  test("in the browser, Bob's board does not show Alice's todo", async ({ browser, playwright }) => {
    const alice = await signInAs(playwright, "alice2");
    const date = "2031-06-06";
    const title = uniq("private");
    await alice.post("/api/todos", { data: { title, date } });
    const state = await alice.storageState();
    await alice.dispose();

    const bob = await signInAs(playwright, "bob2");
    const bobState = await bob.storageState();
    await bob.dispose();

    const aliceCtx = await browser.newContext({ storageState: state });
    const bobCtx = await browser.newContext({ storageState: bobState });
    try {
      const a = await aliceCtx.newPage();
      await a.goto(`/board/${date}`);
      await expect(a.getByTestId("todo-card").filter({ hasText: title })).toBeVisible();
      await expect(a.getByTestId("user-name")).toHaveText("alice2");

      const b = await bobCtx.newPage();
      await b.goto(`/board/${date}`);
      await expect(b.getByTestId("user-name")).toHaveText("bob2");
      await expect(b.getByTestId("todo-card").filter({ hasText: title })).toHaveCount(0);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });
});

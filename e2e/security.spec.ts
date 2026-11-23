import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { MongoClient } from "mongodb";
import { test, expect } from "./fixtures";
import { runState, uniq } from "./support/helpers";

const anonymous = { cookies: [], origins: [] };

test.describe("safety: the run is wired to the throwaway database", () => {
  test("data written through the app appears in the local in-memory MongoDB", async ({ data }) => {
    const s = runState();
    expect(new URL(s.mongoUri).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    const title = uniq("safety-goal");
    const goal = await data.goal(title);
    const client = await MongoClient.connect(s.mongoUri);
    try {
      const found = await client.db(s.mongoDb).collection("goals").findOne({ title });
      expect(found?._id.toString()).toBe(goal.id);
    } finally {
      await client.close();
    }
  });
});

test.describe("AC11: unauthenticated requests", () => {
  test.use({ storageState: anonymous });

  const endpoints: [string, string][] = [
    ["GET", "/api/todos?date=2030-01-01"],
    ["POST", "/api/todos"],
    ["PATCH", "/api/todos/64b000000000000000000001"],
    ["DELETE", "/api/todos/64b000000000000000000001"],
    ["GET", "/api/weekly-plans"],
    ["POST", "/api/weekly-plans"],
    ["GET", "/api/weekly-plans/64b000000000000000000001"],
    ["PATCH", "/api/weekly-plans/64b000000000000000000001"],
    ["DELETE", "/api/weekly-plans/64b000000000000000000001"],
    ["GET", "/api/goals"],
    ["POST", "/api/goals"],
    ["GET", "/api/goals/64b000000000000000000001"],
    ["PATCH", "/api/goals/64b000000000000000000001"],
    ["DELETE", "/api/goals/64b000000000000000000001"],
    ["POST", "/api/auth/logout"],
  ];
  for (const [method, path] of endpoints) {
    test(`${method} ${path} returns 401 without a session`, async ({ playwright }) => {
      const s = runState();
      const ctx = await playwright.request.newContext({ baseURL: s.baseURL, extraHTTPHeaders: { Origin: s.baseURL } });
      const res = await ctx.fetch(path, { method, data: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHORIZED");
      await ctx.dispose();
    });
  }

  test("a forged or garbage session cookie is rejected", async ({ playwright }) => {
    const s = runState();
    const ctx = await playwright.request.newContext({
      baseURL: s.baseURL,
      extraHTTPHeaders: { Cookie: "session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.", Origin: s.baseURL },
    });
    expect((await ctx.get("/api/goals")).status()).toBe(401);
    await ctx.dispose();
  });

  test("a page visit redirects to /login with the original path in next", async ({ page }) => {
    await page.goto("/board/2030-05-05");
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/board/2030-05-05");
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("login ignores an off-site next target and stays on this site", async ({ browser }) => {
    const s = runState();
    for (const evil of ["https://evil.example/x", "//evil.example/x", "/\\evil.example"]) {
      // A fresh context per target: the previous page may still be navigating on its own.
      const context = await browser.newContext({ baseURL: s.baseURL });
      const page = await context.newPage();
      await page.goto(`/login?next=${encodeURIComponent(evil)}`);
      await page.getByTestId("login-github").click();
      // "/" resolves to today's board; waiting for it also means no navigation is still in flight.
      await expect(page).toHaveURL(/\/board\/\d{4}-\d{2}-\d{2}$/);
      expect(new URL(page.url()).origin).toBe(s.baseURL);
      await context.close();
    }
  });

  test("the login page offers GitHub only: no password field, no anonymous way in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-github")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByTestId("login-github")).toHaveAttribute("href", "/auth/github");
    // The old passwordless login route is gone: with no session the proxy answers 401 first.
    const res = await page.request.post("/api/auth/login", { data: {}, headers: { Origin: runState().baseURL } });
    expect(res.status()).toBe(401);
  });

  test("login redirects to the original page after success", async ({ page }) => {
    await page.goto("/weekly");
    await expect(page).toHaveURL(/\/login\?next=%2Fweekly/);
    await page.getByTestId("login-github").click();
    await expect(page).toHaveURL(/\/weekly$/);
    await expect(page.getByTestId("nav-weekly").first()).toHaveAttribute("aria-current", "page");
  });
});

test.describe("origin check on mutating requests", () => {
  test("a valid session with a foreign Origin gets 403 on every mutating verb and changes nothing", async ({ api, data }) => {
    const s = runState();
    const goal = await data.goal(uniq("origin-goal"));
    const foreign = { Origin: "https://evil.example" };
    const post = await api.post("/api/goals", { data: { title: "evil", year: 2030 }, headers: foreign });
    expect(post.status()).toBe(403);
    const patch = await api.patch(`/api/goals/${goal.id}`, { data: { title: "evil" }, headers: foreign });
    expect(patch.status()).toBe(403);
    const del = await api.delete(`/api/goals/${goal.id}`, { headers: foreign });
    expect(del.status()).toBe(403);
    expect((await data.getGoal(goal.id)).title).toBe(goal.title);
    const list = await (await api.get("/api/goals")).json();
    expect(list.goals.some((g: { title: string }) => g.title === "evil")).toBe(false);
    expect(s.baseURL).toContain("127.0.0.1");
  });

  test("a valid session without any Origin header is also refused", async ({ playwright }) => {
    const s = runState();
    const ctx = await playwright.request.newContext({ baseURL: s.baseURL, storageState: "e2e/.run/auth.json" });
    const res = await ctx.post("/api/goals", { data: { title: "no-origin", year: 2030 } });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("a valid session with the same Origin can mutate", async ({ api }) => {
    const res = await api.post("/api/goals", { data: { title: uniq("same-origin"), year: 2030 } });
    expect(res.status()).toBe(201);
  });
});

test.describe("AC12: secrets stay out of the client", () => {
  test("the client bundle and served HTML contain neither SESSION_SECRET, the GitHub client secret nor the Mongo URI", async ({ page }) => {
    const s = runState();
    const staticDir = resolve(__dirname, "../.next/static");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|css|html|json|txt)$/.test(name)) files.push(p);
      }
    };
    walk(staticDir);
    expect(files.length).toBeGreaterThan(0);
    const secrets = [s.secret, s.githubClientSecret, s.mongoUri, new URL(s.mongoUri).host];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of secrets) expect(text.includes(secret), `${f} leaks a secret`).toBe(false);
    }
    const html = await (await page.request.get("/goals")).text();
    for (const secret of secrets) expect(html.includes(secret)).toBe(false);
  });
});


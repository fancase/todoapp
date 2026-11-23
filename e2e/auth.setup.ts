import { request, test as setup, expect } from "@playwright/test";
import { AUTH_FILE, runState } from "./support/helpers";

setup("log in once and store the session", async () => {
  const s = runState();
  // Safety: the run must be wired to a throwaway local database.
  expect(new URL(s.mongoUri).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  const ctx = await request.newContext({ baseURL: s.baseURL, extraHTTPHeaders: { Origin: s.baseURL } });
  const res = await ctx.post("/api/auth/login");
  expect(res.status()).toBe(200);
  await ctx.storageState({ path: AUTH_FILE });
  await ctx.dispose();
});

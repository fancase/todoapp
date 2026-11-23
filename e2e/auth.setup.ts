import { test as setup, expect } from "@playwright/test";
import { AUTH_FILE, runState, signInAs } from "./support/helpers";

setup("log in once through GitHub OAuth and store the session", async ({ playwright }) => {
  const s = runState();
  // Safety: the run must be wired to a throwaway local database.
  expect(new URL(s.mongoUri).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  const ctx = await signInAs(playwright, "e2e-owner", "/");
  await ctx.storageState({ path: AUTH_FILE });
  await ctx.dispose();
});

import { test as base, request, type APIRequestContext } from "@playwright/test";
import { runState, seed } from "./support/helpers";

export const test = base.extend<{ api: APIRequestContext; data: ReturnType<typeof seed> }>({
  // Authenticated, same-origin API client for seeding and assertions on server state.
  api: async ({}, provide) => {
    const s = runState();
    const ctx = await request.newContext({
      baseURL: s.baseURL,
      storageState: "e2e/.run/auth.json",
      extraHTTPHeaders: { Origin: s.baseURL },
    });
    await provide(ctx);
    await ctx.dispose();
  },
  data: async ({ api }, provide) => provide(seed(api)),
});

export { expect } from "@playwright/test";

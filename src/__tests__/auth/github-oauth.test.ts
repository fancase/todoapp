import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";

vi.mock("server-only", () => ({}));

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret-do-not-leak";
const SECRET = "s".repeat(40);
process.env.MONGODB_URI = "mongodb://unused";
process.env.MONGODB_DB = "test";
process.env.SESSION_SECRET = SECRET;
process.env.GITHUB_CLIENT_ID = CLIENT_ID;
process.env.GITHUB_CLIENT_SECRET = CLIENT_SECRET;
delete process.env.APP_URL;
delete process.env.GITHUB_URL;
delete process.env.GITHUB_API_URL;

let db: Db;
vi.mock("@/lib/db", () => ({ getDb: () => db }));

let mongod: MongoMemoryServer;
let client: MongoClient;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db("test");
});
afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});
beforeEach(async () => {
  await Promise.all(["users", "sessions"].map((c) => db.collection(c).deleteMany({})));
});
afterEach(() => vi.restoreAllMocks());

const HOST = "app.example.com";
const ORIGIN = `https://${HOST}`;

const ACCESS_TOKEN = "gho_fake_access_token_value";
const PROFILE = { id: 4242, login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/4242" };

interface FakeGithub {
  tokenStatus?: number;
  tokenBody?: unknown;
  tokenThrows?: boolean;
  profileStatus?: number;
  profileBody?: unknown;
}

function fakeGithub(opts: FakeGithub = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://github.com/login/oauth/access_token") {
      if (opts.tokenThrows) throw new TypeError("network down");
      return Response.json(opts.tokenBody ?? { access_token: ACCESS_TOKEN, token_type: "bearer" }, {
        status: opts.tokenStatus ?? 200,
      });
    }
    if (url === "https://api.github.com/user") {
      return Response.json(opts.profileBody ?? PROFILE, { status: opts.profileStatus ?? 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return calls;
}

const routes = async () => ({
  start: await import("@/app/auth/github/route"),
  callback: await import("@/app/auth/github/callback/route"),
  auth: await import("@/lib/auth"),
});

function cookieHeader(setCookies: string[]): string {
  return setCookies
    .map((c) => c.split(";")[0])
    .filter((c) => !/=$/.test(c))
    .join("; ");
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

/** Runs /auth/github and returns the state GitHub would echo back plus the cookies the browser would keep. */
async function begin(next?: string) {
  const { start } = await routes();
  const q = next === undefined ? "" : `?next=${encodeURIComponent(next)}`;
  const res = await start.GET(new Request(`${ORIGIN}/auth/github${q}`, { headers: { host: HOST } }));
  const location = new URL(res.headers.get("location")!);
  return { res, location, state: location.searchParams.get("state")!, cookie: cookieHeader(setCookies(res)) };
}

function callbackRequest(query: string, cookie?: string) {
  return new Request(`${ORIGIN}/auth/github/callback?${query}`, {
    headers: { host: HOST, ...(cookie ? { cookie } : {}) },
  });
}

describe("GET /auth/github", () => {
  it("redirects to GitHub with client_id, callback URL and a random state, and remembers the state in a cookie", async () => {
    const { res, location, state } = await begin("/weekly");
    expect(res.status).toBe(307);
    expect(`${location.origin}${location.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/github/callback`);
    expect(location.searchParams.get("scope")).toBe("read:user");
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const cookies = setCookies(res);
    const stateCookie = cookies.find((c) => c.startsWith("oauth_state="))!;
    expect(stateCookie).toContain(`oauth_state=${state}`);
    expect(stateCookie).toMatch(/HttpOnly/i);
    expect(stateCookie).toMatch(/SameSite=lax/i);
    expect(stateCookie).toMatch(/Path=\/auth\/github/);
    expect(stateCookie).toMatch(/Max-Age=600/);
    expect(cookies.find((c) => c.startsWith("oauth_next="))).toContain("oauth_next=%2Fweekly");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("builds the callback URL from Host and x-forwarded-proto, not from a normalized request.url", async () => {
    const { start } = await routes();
    const redirectUriFor = async (url: string, headers: Record<string, string>) => {
      const res = await start.GET(new Request(url, { headers }));
      return new URL(res.headers.get("location")!).searchParams.get("redirect_uri");
    };
    expect(await redirectUriFor("http://localhost:3000/auth/github", { host: "127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000/auth/github/callback",
    );
    expect(
      await redirectUriFor("http://internal/auth/github", { host: HOST, "x-forwarded-proto": "https, http" }),
    ).toBe(`${ORIGIN}/auth/github/callback`);
    // A hostile Host value falls back to the request URL instead of being echoed.
    expect(await redirectUriFor("https://app.example.com/auth/github", { host: "evil.example/path?x" })).toBe(
      `${ORIGIN}/auth/github/callback`,
    );
  });

  it("uses a fresh state every time", async () => {
    const a = await begin();
    const b = await begin();
    expect(a.state).not.toBe(b.state);
  });

  it("never puts the client secret in the redirect or the cookies", async () => {
    const { res } = await begin();
    const everything = [res.headers.get("location"), ...setCookies(res)].join("\n");
    expect(everything).not.toContain(CLIENT_SECRET);
  });

  it("falls back to / for off-site next targets", async () => {
    for (const evil of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)"]) {
      const { res } = await begin(evil);
      expect(setCookies(res).find((c) => c.startsWith("oauth_next="))!, evil).toContain("oauth_next=%2F;");
    }
  });
});

describe("GET /auth/github/callback", () => {
  it("signs in: stores the GitHub profile, creates a server session, and goes to the saved next page", async () => {
    const calls = fakeGithub();
    const { callback, auth } = await routes();
    const { state, cookie } = await begin("/goals");

    const res = await callback.GET(callbackRequest(`code=abc123&state=${state}`, cookie));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/goals");

    const user = await db.collection("users").findOne({ githubId: PROFILE.id });
    expect(user).toMatchObject({ githubId: 4242, username: "octocat", avatarUrl: PROFILE.avatar_url });
    expect(user!.createdAt).toBeInstanceOf(Date);

    const cookies = setCookies(res);
    const sessionCookie = cookies.find((c) => c.startsWith("session="))!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=lax/i);
    expect(sessionCookie).toMatch(/Path=\//);
    const token = /session=([^;]+)/.exec(sessionCookie)![1];
    const resolved = await auth.resolveSession(token);
    expect(resolved?.userId.equals(user!._id)).toBe(true);

    // The one-time OAuth cookies are cleared on the way out.
    expect(cookies.find((c) => c.startsWith("oauth_state="))).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    // The token exchange carried the secret to GitHub, in the body, and nowhere else.
    const exchange = calls.find((c) => c.url.endsWith("/access_token"))!;
    const sent = JSON.parse(String(exchange.init!.body));
    expect(sent).toMatchObject({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: "abc123" });
    expect(sent.redirect_uri).toBe(`${ORIGIN}/auth/github/callback`);
    const profileCall = calls.find((c) => c.url.endsWith("/user"))!;
    expect((profileCall.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(res.headers.get("location")).not.toContain(CLIENT_SECRET);
    expect(cookies.join("\n")).not.toContain(CLIENT_SECRET);
  });

  it("does not store the GitHub access token anywhere", async () => {
    fakeGithub();
    const { callback } = await routes();
    const { state, cookie } = await begin();
    await callback.GET(callbackRequest(`code=abc&state=${state}`, cookie));
    for (const name of ["users", "sessions"]) {
      const docs = JSON.stringify(await db.collection(name).find().toArray());
      expect(docs).not.toContain(ACCESS_TOKEN);
      expect(docs).not.toContain(CLIENT_SECRET);
    }
  });

  it("logging in again updates username and avatar without creating a second user", async () => {
    const { callback } = await routes();
    fakeGithub();
    let flow = await begin();
    await callback.GET(callbackRequest(`code=1&state=${flow.state}`, flow.cookie));
    const first = await db.collection("users").findOne({ githubId: 4242 });

    vi.restoreAllMocks();
    fakeGithub({ profileBody: { ...PROFILE, login: "renamed", avatar_url: "https://avatars.githubusercontent.com/u/new" } });
    flow = await begin();
    await callback.GET(callbackRequest(`code=2&state=${flow.state}`, flow.cookie));

    expect(await db.collection("users").countDocuments()).toBe(1);
    const second = await db.collection("users").findOne({ githubId: 4242 });
    expect(second).toMatchObject({ username: "renamed", avatarUrl: "https://avatars.githubusercontent.com/u/new" });
    expect(second!._id.equals(first!._id)).toBe(true);
    expect(second!.createdAt.getTime()).toBe(first!.createdAt.getTime());
    expect(second!.lastLoginAt.getTime()).toBeGreaterThanOrEqual(first!.lastLoginAt.getTime());
    expect(await db.collection("sessions").countDocuments()).toBe(2);
  });

  it("simultaneous first logins of one account create exactly one user", async () => {
    await db.collection("users").createIndex({ githubId: 1 }, { unique: true });
    const { upsertGithubUser } = await import("@/server/users");
    const profile = { githubId: 99, username: "racer", avatarUrl: "https://avatars.githubusercontent.com/u/99" };
    const results = await Promise.all(Array.from({ length: 12 }, () => upsertGithubUser(profile)));
    expect(await db.collection("users").countDocuments({ githubId: 99 })).toBe(1);
    expect(new Set(results.map((u) => u._id.toHexString())).size).toBe(1);
    await db.collection("users").dropIndex("githubId_1");
  });

  it("signing in again destroys the session that was already in the browser", async () => {
    fakeGithub();
    const { callback, auth } = await routes();
    let flow = await begin();
    const first = await callback.GET(callbackRequest(`code=1&state=${flow.state}`, flow.cookie));
    const oldToken = /session=([^;]+)/.exec(setCookies(first).find((c) => c.startsWith("session="))!)![1];
    expect(await auth.resolveSession(oldToken)).not.toBeNull();

    flow = await begin();
    const second = await callback.GET(
      callbackRequest(`code=2&state=${flow.state}`, `${flow.cookie}; session=${oldToken}`),
    );
    const newToken = /session=([^;]+)/.exec(setCookies(second).find((c) => c.startsWith("session="))!)![1];
    expect(await auth.resolveSession(oldToken)).toBeNull();
    expect(await auth.resolveSession(newToken)).not.toBeNull();
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });

  it("maps any GitHub error parameter to a message instead of a state error", async () => {
    const calls = fakeGithub();
    const { callback } = await routes();
    const { state, cookie } = await begin();
    const res = await callback.GET(callbackRequest(`error=redirect_uri_mismatch&state=${state}`, cookie));
    expect(new URL(res.headers.get("location")!).search).toBe("?error=github");
    expect(calls).toHaveLength(0);
  });

  it("two GitHub accounts become two separate users", async () => {
    const { callback } = await routes();
    for (const profile of [PROFILE, { id: 7, login: "other", avatar_url: "https://avatars.githubusercontent.com/u/7" }]) {
      vi.restoreAllMocks();
      fakeGithub({ profileBody: profile });
      const flow = await begin();
      await callback.GET(callbackRequest(`code=x&state=${flow.state}`, flow.cookie));
    }
    expect(await db.collection("users").countDocuments()).toBe(2);
  });

  it("refuses a missing, wrong or replayed state without calling GitHub or creating a session", async () => {
    const calls = fakeGithub();
    const { callback } = await routes();
    const { state, cookie } = await begin();
    const attempts: [string, string | undefined][] = [
      [`code=abc`, cookie], // state missing from the URL
      [`code=abc&state=${state}`, undefined], // no state cookie at all
      [`code=abc&state=${state}x`, cookie], // wrong length
      [`code=abc&state=${"A".repeat(state.length)}`, cookie], // same length, wrong value
      [`state=${state}`, cookie], // no code
    ];
    for (const [query, c] of attempts) {
      const res = await callback.GET(callbackRequest(query, c));
      expect(new URL(res.headers.get("location")!).search, query).toBe("?error=state");
      expect(setCookies(res).some((s) => s.startsWith("session="))).toBe(false);
    }
    expect(calls).toHaveLength(0);
    expect(await db.collection("sessions").countDocuments()).toBe(0);
    expect(await db.collection("users").countDocuments()).toBe(0);
  });

  it("an off-site next cookie cannot redirect away from this site", async () => {
    fakeGithub();
    const { callback } = await routes();
    const { state } = await begin();
    const res = await callback.GET(
      callbackRequest(`code=abc&state=${state}`, `oauth_state=${state}; oauth_next=${encodeURIComponent("//evil.example/x")}`),
    );
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe(ORIGIN);
    expect(loc.pathname).toBe("/");
  });

  it("reports a cancelled authorization", async () => {
    const calls = fakeGithub();
    const { callback } = await routes();
    const { state, cookie } = await begin();
    const res = await callback.GET(callbackRequest(`error=access_denied&state=${state}`, cookie));
    expect(new URL(res.headers.get("location")!).search).toBe("?error=denied");
    expect(calls).toHaveLength(0);
    expect(await db.collection("sessions").countDocuments()).toBe(0);
  });

  const failures: [string, FakeGithub][] = [
    ["a rejected or reused code (200 with error body)", { tokenBody: { error: "bad_verification_code" } }],
    ["a token endpoint 500", { tokenStatus: 500 }],
    ["a token endpoint network failure", { tokenThrows: true }],
    ["a profile endpoint 401", { profileStatus: 401 }],
    ["a profile without an id", { profileBody: { login: "x", avatar_url: "https://avatars.githubusercontent.com/u/1" } }],
    ["an avatar that is not https", { profileBody: { ...PROFILE, avatar_url: "javascript:alert(1)" } }],
    ["a non-JSON profile", { profileBody: "nope" }],
  ];
  for (const [name, opts] of failures) {
    it(`creates no user or session on ${name}`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      fakeGithub(opts);
      const { callback } = await routes();
      const { state, cookie } = await begin();
      const res = await callback.GET(callbackRequest(`code=abc&state=${state}`, cookie));
      expect(new URL(res.headers.get("location")!).search).toBe("?error=github");
      expect(setCookies(res).some((s) => s.startsWith("session=") && !/Max-Age=0/.test(s))).toBe(false);
      expect(await db.collection("sessions").countDocuments()).toBe(0);
      expect(await db.collection("users").countDocuments()).toBe(0);
    });
  }

  it("does not log the access token, the code or the client secret when a step fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeGithub({ profileStatus: 500 });
    const { callback } = await routes();
    const { state, cookie } = await begin();
    await callback.GET(callbackRequest(`code=super-secret-code&state=${state}`, cookie));
    const logged = JSON.stringify(spy.mock.calls);
    for (const secret of [ACCESS_TOKEN, CLIENT_SECRET, "super-secret-code"]) expect(logged).not.toContain(secret);
  });
});

describe("when GitHub login is not configured", () => {
  it("both routes send the user back to /login?error=not_configured and never contact GitHub", async () => {
    const saved = { id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET };
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    vi.resetModules();
    try {
      const calls = fakeGithub();
      const start = await import("@/app/auth/github/route");
      const callback = await import("@/app/auth/github/callback/route");
      for (const res of [
        await start.GET(new Request(`${ORIGIN}/auth/github`, { headers: { host: HOST } })),
        await callback.GET(callbackRequest("code=a&state=b")),
      ]) {
        expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
        expect(new URL(res.headers.get("location")!).search).toBe("?error=not_configured");
      }
      expect(calls).toHaveLength(0);
    } finally {
      process.env.GITHUB_CLIENT_ID = saved.id;
      process.env.GITHUB_CLIENT_SECRET = saved.secret;
      vi.resetModules();
    }
  });
});

describe("APP_URL", () => {
  it("decides the public origin and callback URL when set", async () => {
    process.env.APP_URL = "https://todo.example.org/ignored/path";
    vi.resetModules();
    try {
      const { start } = await routes();
      const res = await start.GET(new Request(`http://internal:3000/auth/github`));
      const location = new URL(res.headers.get("location")!);
      expect(location.searchParams.get("redirect_uri")).toBe("https://todo.example.org/auth/github/callback");
    } finally {
      delete process.env.APP_URL;
      vi.resetModules();
    }
  });
});

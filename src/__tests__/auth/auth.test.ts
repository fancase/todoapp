import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(40);
process.env.MONGODB_URI = "mongodb://unused";
process.env.MONGODB_DB = "test";
process.env.SESSION_SECRET = SECRET;

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
  await db.collection("sessions").deleteMany({});
});

const HOST = "app.example.com";
const ORIGIN = `https://${HOST}`;

function req(
  path: string,
  init: { method?: string; origin?: string | null; cookie?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { host: HOST };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function importAll() {
  const auth = await import("@/lib/auth");
  const { proxy } = await import("@/proxy");
  const logout = await import("@/app/api/auth/logout/route");
  const session = await import("@/server/session");
  return { auth, proxy, logout, session };
}

const sign = (
  claims: Record<string, unknown>,
  sub: string,
  secret = SECRET,
  alg = "HS256",
  exp: string | number = "1h",
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg })
    .setSubject(sub)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

describe("session tokens", () => {
  it("accepts a fresh token and records a server-side session", async () => {
    const { auth } = await importAll();
    const userId = new ObjectId();
    const token = await auth.createSession(userId);
    expect(await auth.verifySessionToken(token)).toBe(true);
    const resolved = await auth.resolveSession(token);
    expect(resolved?.userId.equals(userId)).toBe(true);
    const doc = await db.collection("sessions").findOne({ _id: resolved!.sid as never });
    expect(doc).toMatchObject({ userId });
    expect(doc!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  });

  it("rejects missing, garbage, tampered, wrong-secret, expired, alg=none and malformed-claim tokens", async () => {
    const { auth } = await importAll();
    const userId = new ObjectId();
    const good = await auth.createSession(userId);
    const [h, p, s] = good.split(".");
    const tampered = `${h}.${Buffer.from(`{"sub":"${new ObjectId().toHexString()}","exp":9999999999}`).toString("base64url")}.${s}`;
    const sid = "x".repeat(32);
    const sub = userId.toHexString();
    const cases = [
      undefined,
      "",
      "garbage",
      tampered,
      await sign({ sid }, sub, "x".repeat(40)),
      await sign({ sid }, sub, SECRET, "HS256", Math.floor(Date.now() / 1000) - 10),
      await sign({ sid }, sub, SECRET, "HS512"),
      `${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`,
      await sign({}, sub), // no sid
      await sign({ sid: "short" }, sub),
      await sign({ sid }, "owner"), // sub is not an ObjectId
    ];
    for (const t of cases) {
      expect(await auth.verifySessionToken(t)).toBe(false);
      expect(await auth.resolveSession(t)).toBeNull();
    }
  });

  it("expires in 7 days", async () => {
    const { auth } = await importAll();
    const token = await auth.createSession(new ObjectId());
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("a correctly signed token is useless once its session document is gone", async () => {
    const { auth } = await importAll();
    const token = await auth.createSession(new ObjectId());
    expect(await auth.resolveSession(token)).not.toBeNull();
    await db.collection("sessions").deleteMany({});
    expect(await auth.verifySessionToken(token)).toBe(true); // signature alone is still fine
    expect(await auth.resolveSession(token)).toBeNull(); // but the database says no
  });

  it("an expired session document is rejected even before the TTL job removes it", async () => {
    const { auth } = await importAll();
    const token = await auth.createSession(new ObjectId());
    await db.collection("sessions").updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await auth.resolveSession(token)).toBeNull();
  });

  it("a token cannot borrow another user's session document", async () => {
    const { auth } = await importAll();
    const a = await auth.createSession(new ObjectId());
    const sidOfA = JSON.parse(Buffer.from(a.split(".")[1], "base64url").toString()).sid as string;
    const forged = await sign({ sid: sidOfA }, new ObjectId().toHexString());
    expect(await auth.resolveSession(forged)).toBeNull();
  });

  it("destroySession deletes only that session and ignores bad tokens", async () => {
    const { auth } = await importAll();
    const keep = await auth.createSession(new ObjectId());
    const drop = await auth.createSession(new ObjectId());
    await auth.destroySession(drop);
    await auth.destroySession("garbage");
    await auth.destroySession(undefined);
    expect(await auth.resolveSession(drop)).toBeNull();
    expect(await auth.resolveSession(keep)).not.toBeNull();
  });
});

describe("getCookie", () => {
  it("finds a named cookie among several and tolerates odd input", async () => {
    const { auth } = await importAll();
    const r = (cookie?: string) => new Request("http://x", { headers: cookie ? { cookie } : {} });
    expect(auth.getCookie(r("a=1; session=abc; b=2"), "session")).toBe("abc");
    expect(auth.getCookie(r("xsession=nope"), "session")).toBeUndefined();
    expect(auth.getCookie(r("session=%E0%A4%A"), "session")).toBe("%E0%A4%A");
    expect(auth.getCookie(r(), "session")).toBeUndefined();
  });
});

describe("proxy", () => {
  it("returns 401 JSON for every unauthenticated API request", async () => {
    const { proxy } = await importAll();
    for (const path of ["/api/todos", "/api/goals/abc", "/api/weekly-plans", "/api/auth/logout", "/api/auth/login", "/api/nope"]) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        const res = await proxy(req(path, { method }));
        expect(res.status, `${method} ${path}`).toBe(401);
        expect((await res.json()).error.code).toBe("UNAUTHORIZED");
      }
    }
  });

  it("does not let API paths with dots or odd casing skip auth", async () => {
    const { proxy } = await importAll();
    for (const path of ["/api/todos.json", "/api/x.png", "/api/"]) {
      expect((await proxy(req(path))).status).toBe(401);
    }
  });

  it("redirects unauthenticated pages to /login with a next param", async () => {
    const { proxy } = await importAll();
    const res = await proxy(req("/board/2026-01-01"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/board/2026-01-01");
  });

  it("leaves only /login and the two OAuth routes public", async () => {
    const { proxy } = await importAll();
    for (const p of ["/login", "/auth/github", "/auth/github/callback"]) {
      expect((await proxy(req(p))).headers.get("x-middleware-next"), p).toBe("1");
    }
    for (const p of ["/auth/github/other", "/auth/other", "/login/x", "/auth/github/callback/x"]) {
      expect((await proxy(req(p))).status, p).toBe(307);
    }
  });

  it("passes authenticated requests and enforces Origin on mutations", async () => {
    const { auth, proxy } = await importAll();
    const cookie = `session=${await auth.createSession(new ObjectId())}`;
    expect((await proxy(req("/api/todos", { cookie }))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/api/todos", { cookie, method: "POST" }))).headers.get("x-middleware-next")).toBe("1");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      for (const origin of ["https://evil.example", `https://${HOST}.evil.example`, "null", null]) {
        const res = await proxy(req("/api/todos", { cookie, method, origin }));
        expect(res.status, `${method} ${origin}`).toBe(403);
        expect((await res.json()).error.code).toBe("FORBIDDEN_ORIGIN");
      }
    }
  });

  it("ignores a spoofed X-Forwarded-Host", async () => {
    const { auth, proxy } = await importAll();
    const cookie = `session=${await auth.createSession(new ObjectId())}`;
    const r = new NextRequest(`${ORIGIN}/api/todos`, {
      method: "POST",
      headers: { host: HOST, origin: "https://evil.example", "x-forwarded-host": "evil.example", cookie },
    });
    expect((await proxy(r)).status).toBe(403);
  });
});

describe("requireUserId", () => {
  it("returns the user for a live session and 401 for none, garbage, or a deleted session", async () => {
    const { auth, session } = await importAll();
    const userId = new ObjectId();
    const token = await auth.createSession(userId);
    const withCookie = (c?: string) => new Request("http://x/api", { headers: c ? { cookie: c } : {} });
    expect((await session.requireUserId(withCookie(`session=${token}`))).equals(userId)).toBe(true);
    for (const c of [undefined, "session=garbage", "other=1"]) {
      await expect(session.requireUserId(withCookie(c))).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    }
    await auth.destroySession(token);
    await expect(session.requireUserId(withCookie(`session=${token}`))).rejects.toMatchObject({ status: 401 });
  });
});

describe("proxy matcher", () => {
  it("keeps dotted app paths protected and exempts only explicit root assets", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[1]}$`);
    for (const p of [
      "/board/a.b",
      "/goals/a.b",
      "/weekly/a.b",
      "/board/2026-01-01.rsc",
      "/goals/507f1f77bcf86cd799439011.rsc",
      "/board/x.png",
      "/login",
      "/auth/github",
      "/auth/github/callback",
      "/",
    ]) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of ["/next.svg", "/favicon.ico", "/_next/static/a.js", "/api/x"]) {
      expect(re.test(p), p).toBe(false);
    }
  });
});

describe("logout route", () => {
  it("deletes the server-side session, clears the cookie, and the old token stops working", async () => {
    const { auth, logout, proxy } = await importAll();
    const token = await auth.createSession(new ObjectId());
    const cookie = `session=${token}`;
    expect(await db.collection("sessions").countDocuments()).toBe(1);

    const res = await logout.POST(req("/api/auth/logout", { method: "POST", cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/session=;/);
    expect(await db.collection("sessions").countDocuments()).toBe(0);
    expect(await auth.resolveSession(token)).toBeNull();
    // The proxy still sees a well-signed cookie, which is why every handler re-checks the database.
    expect((await proxy(req("/api/todos", { cookie }))).headers.get("x-middleware-next")).toBe("1");
  });

  it("enforces Origin and leaves the session alone when refused", async () => {
    const { auth, logout } = await importAll();
    const cookie = `session=${await auth.createSession(new ObjectId())}`;
    const res = await logout.POST(req("/api/auth/logout", { method: "POST", origin: "https://evil.example", cookie }));
    expect(res.status).toBe(403);
    expect(await db.collection("sessions").countDocuments()).toBe(1);
  });

  it("only removes the caller's own session", async () => {
    const { auth, logout } = await importAll();
    const mine = await auth.createSession(new ObjectId());
    const other = await auth.createSession(new ObjectId());
    await logout.POST(req("/api/auth/logout", { method: "POST", cookie: `session=${mine}` }));
    expect(await auth.resolveSession(other)).not.toBeNull();
  });
});

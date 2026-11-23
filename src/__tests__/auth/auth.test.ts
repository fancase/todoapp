import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(40);
process.env.MONGODB_URI = "mongodb://unused";
process.env.MONGODB_DB = "test";
process.env.SESSION_SECRET = SECRET;

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
  const login = await import("@/app/api/auth/login/route");
  const logout = await import("@/app/api/auth/logout/route");
  return { auth, proxy, login, logout };
}

describe("session tokens", () => {
  it("accepts a fresh token", async () => {
    const { auth } = await importAll();
    expect(await auth.verifySessionToken(await auth.createSessionToken())).toBe(true);
  });

  it("rejects missing, garbage, tampered, wrong-secret, expired and alg=none tokens", async () => {
    const { auth } = await importAll();
    const good = await auth.createSessionToken();
    const [h, p, s] = good.split(".");
    const tampered = `${h}.${Buffer.from('{"sub":"owner","exp":9999999999}').toString("base64url")}.${s}`;
    const wrongSecret = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("owner")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("x".repeat(40)));
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("owner")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRET));
    const hs512 = await new SignJWT({})
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("owner")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`;
    for (const t of [undefined, "", "garbage", tampered, wrongSecret, expired, hs512, none]) {
      expect(await auth.verifySessionToken(t)).toBe(false);
    }
  });

  it("expires in 7 days", async () => {
    const { auth } = await importAll();
    const token = await auth.createSessionToken();
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });
});

describe("proxy", () => {
  it("returns 401 JSON for every unauthenticated API request", async () => {
    const { proxy } = await importAll();
    for (const path of ["/api/todos", "/api/goals/abc", "/api/weekly-plans", "/api/auth/logout", "/api/nope"]) {
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

  it("leaves /login and /api/auth/login public", async () => {
    const { proxy } = await importAll();
    expect((await proxy(req("/login"))).headers.get("x-middleware-next")).toBe("1");
    const res = await proxy(req("/api/auth/login", { method: "POST" }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes authenticated requests and enforces Origin on mutations", async () => {
    const { auth, proxy } = await importAll();
    const cookie = `session=${await auth.createSessionToken()}`;
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
    const cookie = `session=${await auth.createSessionToken()}`;
    const r = new NextRequest(`${ORIGIN}/api/todos`, {
      method: "POST",
      headers: { host: HOST, origin: "https://evil.example", "x-forwarded-host": "evil.example", cookie },
    });
    expect((await proxy(r)).status).toBe(403);
  });
});

describe("login route", () => {
  it("sets a hardened cookie on success", async () => {
    const { login, auth } = await importAll();
    const res = await login.POST(req("/api/auth/login", { method: "POST" }));
    expect(res.status).toBe(200);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Path=\//);
    const token = /session=([^;]+)/.exec(set)![1];
    expect(await auth.verifySessionToken(token)).toBe(true);
  });

  it("returns 403 for a foreign or missing Origin", async () => {
    const { login } = await importAll();
    for (const origin of ["https://evil.example", null]) {
      const res = await login.POST(req("/api/auth/login", { method: "POST", origin }));
      expect(res.status).toBe(403);
    }
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
  it("clears the cookie and enforces Origin", async () => {
    const { logout } = await importAll();
    const res = await logout.POST(req("/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/session=;/);
    expect((await logout.POST(req("/api/auth/logout", { method: "POST", origin: "https://evil.example" }))).status).toBe(403);
  });
});

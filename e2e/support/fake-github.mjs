// A tiny stand-in for github.com and api.github.com, so E2E can run the real OAuth round trip
// (browser -> authorize -> callback -> token exchange -> /user) without real credentials.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const idFor = (login) => {
  let h = 1000;
  for (const ch of login) h = (h * 31 + ch.charCodeAt(0)) % 900000;
  return 1000 + h;
};

/**
 * Test controls (plain POSTs, local only):
 *   POST /__use?login=alice   the next authorize signs in as alice
 *   POST /__deny              the next authorize is refused by the "user"
 *   POST /__break?what=token|profile   the next token / profile call fails with a 500
 */
export async function startFakeGithub({ port, appOrigin, clientId, clientSecret }) {
  let current = "e2e-owner";
  let denyNext = false;
  let breakNext = null;
  const codes = new Map(); // one-time codes -> login
  const tokens = new Map(); // access tokens -> login

  const send = (res, status, body, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === "POST" && url.pathname === "/__use") {
      current = url.searchParams.get("login") || current;
      return send(res, 204, "");
    }
    if (req.method === "POST" && url.pathname === "/__deny") {
      denyNext = true;
      return send(res, 204, "");
    }
    if (req.method === "POST" && url.pathname === "/__break") {
      breakNext = url.searchParams.get("what");
      return send(res, 204, "");
    }

    if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
      if (url.searchParams.get("client_id") !== clientId) return send(res, 400, "bad client_id", "text/plain");
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      if (redirect.origin !== appOrigin) return send(res, 400, "redirect_uri mismatch", "text/plain");
      const state = url.searchParams.get("state");
      if (state) redirect.searchParams.set("state", state);
      if (denyNext) {
        denyNext = false;
        redirect.searchParams.set("error", "access_denied");
      } else {
        const code = randomBytes(8).toString("hex");
        codes.set(code, current);
        redirect.searchParams.set("code", code);
      }
      res.writeHead(302, { Location: redirect.toString() });
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
      if (breakNext === "token") {
        breakNext = null;
        return send(res, 500, { error: "server_error" });
      }
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch {}
      const login = codes.get(body.code);
      if (body.client_id !== clientId || body.client_secret !== clientSecret || !login) {
        return send(res, 200, { error: "bad_verification_code" });
      }
      codes.delete(body.code);
      const token = `gho_${randomBytes(12).toString("hex")}`;
      tokens.set(token, login);
      return send(res, 200, { access_token: token, token_type: "bearer", scope: "read:user" });
    }

    if (req.method === "GET" && url.pathname === "/user") {
      if (breakNext === "profile") {
        breakNext = null;
        return send(res, 500, { message: "boom" });
      }
      const login = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!login) return send(res, 401, { message: "Bad credentials" });
      return send(res, 200, {
        id: idFor(login),
        login,
        avatar_url: `http://127.0.0.1:${port}/avatar/${login}.svg`,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/avatar/")) {
      return send(
        res,
        200,
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#6366f1"/></svg>',
        "image/svg+xml",
      );
    }

    send(res, 404, { message: "Not Found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

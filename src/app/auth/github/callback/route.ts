import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, destroySession, getCookie, sessionCookieOptions } from "@/lib/auth";
import {
  GithubError,
  appOrigin,
  callbackUrl,
  exchangeCode,
  fetchProfile,
  getGithubConfig,
} from "@/lib/github";
import { OAUTH_NEXT_COOKIE, OAUTH_STATE_COOKIE, oauthCookieOptions } from "@/lib/oauth-cookies";
import { safeNextPath } from "@/lib/safe-next";
import { upsertGithubUser } from "@/server/users";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type LoginError = "not_configured" | "denied" | "state" | "github" | "server";

/** Every exit clears the one-time OAuth cookies, so a state value can never be replayed. */
function finish(request: Request, location: string): NextResponse {
  const response = NextResponse.redirect(new URL(location, appOrigin(request)));
  response.cookies.set(OAUTH_STATE_COOKIE, "", oauthCookieOptions(0));
  response.cookies.set(OAUTH_NEXT_COOKIE, "", oauthCookieOptions(0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const fail = (request: Request, error: LoginError) => finish(request, `/login?error=${error}`);

export async function GET(request: Request) {
  const cfg = getGithubConfig();
  if (!cfg) return fail(request, "not_configured");

  const params = new URL(request.url).searchParams;
  const providerError = params.get("error");
  if (providerError) return fail(request, providerError === "access_denied" ? "denied" : "github");

  const state = params.get("state");
  const code = params.get("code");
  const expected = getCookie(request, OAUTH_STATE_COOKIE);
  if (!state || !expected || !sameState(state, expected) || !code) return fail(request, "state");

  try {
    const accessToken = await exchangeCode(cfg, code, callbackUrl(request));
    const profile = await fetchProfile(cfg, accessToken);
    const user = await upsertGithubUser(profile);
    // Signing in again (or as someone else) must not leave the previous session alive.
    await destroySession(getCookie(request, SESSION_COOKIE));
    const token = await createSession(user._id);
    const next = safeNextPath(getCookie(request, OAUTH_NEXT_COOKIE));
    const response = finish(request, next);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (e) {
    // Log the class of failure only: error messages from fetch can carry URLs and request details.
    console.error("GitHub login failed:", e instanceof Error ? e.name : "unknown");
    return fail(request, e instanceof GithubError ? "github" : "server");
  }
}

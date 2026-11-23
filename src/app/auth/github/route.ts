import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appOrigin, buildAuthorizeUrl, callbackUrl, getGithubConfig } from "@/lib/github";
import { OAUTH_NEXT_COOKIE, OAUTH_STATE_COOKIE, oauthCookieOptions } from "@/lib/oauth-cookies";
import { safeNextPath } from "@/lib/safe-next";

/** Starts the OAuth flow: remember a random state (and where to go afterwards), then send the user to GitHub. */
export async function GET(request: Request) {
  const cfg = getGithubConfig();
  if (!cfg) {
    const res = NextResponse.redirect(new URL("/login?error=not_configured", appOrigin(request)));
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildAuthorizeUrl(cfg, callbackUrl(request), state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, oauthCookieOptions());
  response.cookies.set(OAUTH_NEXT_COOKIE, next, oauthCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}

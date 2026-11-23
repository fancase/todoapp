export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_NEXT_COOKIE = "oauth_next";
const OAUTH_COOKIE_PATH = "/auth/github";
const OAUTH_COOKIE_MAX_AGE_SEC = 10 * 60;

export function oauthCookieOptions(maxAge = OAUTH_COOKIE_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    // Lax is sent on the top-level redirect back from github.com, and on nothing cross-site beyond that.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: OAUTH_COOKIE_PATH,
    maxAge,
  };
}

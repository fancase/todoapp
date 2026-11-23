import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  destroySession,
  getCookie,
  isSameOrigin,
  jsonError,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, "FORBIDDEN_ORIGIN", "허용되지 않은 요청 출처입니다.");
  }
  // Delete the server-side session first so the token is dead even if a copy of the cookie exists.
  await destroySession(getCookie(request, SESSION_COOKIE));
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

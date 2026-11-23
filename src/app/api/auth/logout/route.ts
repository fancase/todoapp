import { NextResponse } from "next/server";
import { SESSION_COOKIE, isSameOrigin, jsonError, sessionCookieOptions } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, "FORBIDDEN_ORIGIN", "허용되지 않은 요청 출처입니다.");
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

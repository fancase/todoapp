import { NextResponse, type NextRequest } from "next/server";
import {
  MUTATING_METHODS,
  SESSION_COOKIE,
  isSameOrigin,
  jsonError,
  verifySessionToken,
} from "@/lib/auth";

// Exact paths only: nothing else under /auth is public by accident.
const PUBLIC_PATHS = new Set(["/login", "/auth/github", "/auth/github/callback"]);

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const api = isApi(pathname);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isPublic) {
    const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!ok) {
      if (api) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      if (pathname !== "/") url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }

  if (api && MUTATING_METHODS.has(request.method) && !isSameOrigin(request)) {
    return jsonError(403, "FORBIDDEN_ORIGIN", "허용되지 않은 요청 출처입니다.");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // All API routes, always.
    "/api/:path*",
    // Pages: everything except Next internals and root-level public assets with an
    // explicit static extension. Dots elsewhere (e.g. /board/a.b, .rsc) stay protected.
    "/((?!api|_next/static|_next/image|[^/]+\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|webmanifest)$).*)",
  ],
};

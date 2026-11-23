import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
const ALGORITHM = "HS256";

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALGORITHM],
      requiredClaims: ["exp", "sub"],
    });
    return payload.sub === "owner";
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

/**
 * Same-origin check for state-changing requests. Compares Origin's host with
 * the Host header only. X-Forwarded-Host is deliberately not consulted: it is
 * client-controllable on any deployment that does not overwrite it, and Vercel
 * already forwards the public host in Host. Missing Origin fails closed.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

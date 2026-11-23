import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { jwtVerify, SignJWT } from "jose";
import { getEnv } from "@/lib/env";
import { sessionsCol } from "@/lib/collections";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
const ALGORITHM = "HS256";

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export interface SessionIdentity {
  userId: ObjectId;
  sid: string;
}

const OBJECT_ID = /^[0-9a-f]{24}$/;

/** Verifies signature, algorithm, expiry and claim shape. Does not look at the database. */
async function parseToken(token: string | undefined): Promise<{ userId: string; sid: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALGORITHM],
      requiredClaims: ["exp", "sub"],
    });
    const { sub, sid } = payload;
    if (typeof sub !== "string" || !OBJECT_ID.test(sub)) return null;
    if (typeof sid !== "string" || sid.length < 16) return null;
    return { userId: sub, sid };
  } catch {
    return null;
  }
}

/** Cheap check for the proxy: a correctly signed, unexpired token. The database decides later. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return (await parseToken(token)) !== null;
}

/** Creates the server-side session and returns the signed cookie value that points at it. */
export async function createSession(userId: ObjectId): Promise<string> {
  const sid = randomBytes(24).toString("base64url");
  const now = new Date();
  await sessionsCol().insertOne({
    _id: sid,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SEC * 1000),
  });
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId.toHexString())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

/**
 * The authoritative check: the token must be validly signed AND its session document must exist,
 * be unexpired and belong to the same user. A deleted session invalidates the token everywhere.
 */
export async function resolveSession(token: string | undefined): Promise<SessionIdentity | null> {
  const parsed = await parseToken(token);
  if (!parsed) return null;
  const doc = await sessionsCol().findOne({ _id: parsed.sid });
  if (!doc || doc.expiresAt.getTime() <= Date.now()) return null;
  if (doc.userId.toHexString() !== parsed.userId) return null;
  return { userId: doc.userId, sid: doc._id };
}

/** Deletes the session behind a token. Safe to call with a stale or invalid token. */
export async function destroySession(token: string | undefined): Promise<void> {
  const parsed = await parseToken(token);
  if (!parsed) return;
  await sessionsCol().deleteOne({ _id: parsed.sid });
}

/** Reads one cookie from a Cookie header without depending on the framework request type. */
export function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
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

import "server-only";
import type { ObjectId } from "mongodb";
import { SESSION_COOKIE, getCookie, resolveSession } from "@/lib/auth";
import { ApiError } from "./http";

/** The signed-in user's id for an API request. Throws 401 when there is no live session. */
export async function requireUserId(req: Request): Promise<ObjectId> {
  const session = await resolveSession(getCookie(req, SESSION_COOKIE));
  if (!session) throw new ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  return session.userId;
}

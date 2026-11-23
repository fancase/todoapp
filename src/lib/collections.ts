import "server-only";
import type { SessionDoc, User } from "@/domain/types";
import { getDb } from "@/lib/db";

export const usersCol = () => getDb().collection<User>("users");
export const sessionsCol = () => getDb().collection<SessionDoc>("sessions");

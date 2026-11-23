import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { isObjectIdString } from "@/domain/schemas";
import type { ApiErrorBody } from "@/domain/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new ApiError(400, "BAD_REQUEST", message);
export const notFound = (what: string) =>
  new ApiError(404, "NOT_FOUND", `${what}을(를) 찾을 수 없습니다`);

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(e: ApiError): Response {
  const body: ApiErrorBody = {
    error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
  };
  return Response.json(body, { status: e.status, headers: NO_STORE });
}

/** Maps ApiError/ZodError to the unified error body; hides internals on unexpected errors. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    if (e instanceof z.ZodError) return errorResponse(zodToApiError(e));
    console.error("Unhandled API error:", e instanceof Error ? e.name : "unknown");
    return errorResponse(new ApiError(500, "INTERNAL_ERROR", "서버 오류가 발생했습니다"));
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function zodToApiError(e: z.ZodError): ApiError {
  const details = e.issues.map((i) => ({
    field: i.path.join(".") || "(body)",
    message: i.message,
  }));
  return new ApiError(400, "VALIDATION_ERROR", "입력값이 올바르지 않습니다", details);
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw zodToApiError(r.error);
  return r.data;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("요청 본문이 올바른 JSON이 아닙니다");
  }
}

export function parseId(raw: string): ObjectId {
  if (!isObjectIdString(raw)) throw badRequest("올바르지 않은 ID 형식입니다");
  return new ObjectId(raw);
}

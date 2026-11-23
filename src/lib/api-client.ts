import type { ApiErrorBody } from "@/domain/types";
import { safeNextPath } from "@/lib/safe-next";

export interface FieldError {
  field: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export const isUnauthorized = (e: unknown): boolean =>
  e instanceof ApiRequestError && e.status === 401;

/** 400 (malformed id) and 404 both mean "this resource does not exist" on detail screens. */
export const isMissingResource = (e: unknown): boolean =>
  e instanceof ApiRequestError && (e.status === 404 || e.status === 400);

let redirecting = false;

/** Send the user to /login, preserving where they were via a same-site `next`. */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  const here = window.location.pathname + window.location.search;
  const next = safeNextPath(here);
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  // Full navigation on purpose: drops all client state with the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login${query}`);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "네트워크 연결을 확인해 주세요.");
  }

  if (res.ok) {
    return (await res.json()) as T;
  }

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiRequestError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }

  const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  throw new ApiRequestError(
    res.status,
    body?.error?.code ?? "UNKNOWN",
    body?.error?.message ?? "요청을 처리하지 못했습니다.",
    body?.error?.details ?? [],
  );
}

export const jsonBody = (value: unknown): RequestInit => ({
  body: JSON.stringify(value),
});

/** field name to message map for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (error instanceof ApiRequestError) {
    for (const d of error.details) if (!(d.field in out)) out[d.field] = d.message;
  }
  return out;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

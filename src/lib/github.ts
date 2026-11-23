import "server-only";
import { z } from "zod";
import { getEnv } from "@/lib/env";

const TIMEOUT_MS = 8000;
const DEFAULT_GITHUB_URL = "https://github.com";
const DEFAULT_API_URL = "https://api.github.com";

export class GithubError extends Error {}

export interface GithubConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  apiUrl: string;
}

/** Credentials come from the environment only. Returns null until both are set. */
export function getGithubConfig(): GithubConfig | null {
  const env = getEnv();
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    baseUrl: (env.GITHUB_URL ?? DEFAULT_GITHUB_URL).replace(/\/+$/, ""),
    apiUrl: (env.GITHUB_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, ""),
  };
}

/**
 * Public origin of this app. APP_URL wins. Otherwise it is rebuilt from the Host header and
 * x-forwarded-proto, because `request.url` can carry a normalized host (e.g. localhost) that is not
 * the address the browser used. A wrong value is harmless to security: GitHub only redirects back
 * to the callback URL registered on the OAuth App.
 */
export function appOrigin(request: Request): string {
  const configured = getEnv().APP_URL;
  if (configured) return new URL(configured).origin;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  if (host && /^[A-Za-z0-9.\-:[\]]+$/.test(host) && (proto === "http" || proto === "https")) {
    return `${proto}://${host}`;
  }
  return url.origin;
}

export function callbackUrl(request: Request): string {
  return `${appOrigin(request)}/auth/github/callback`;
}

export function buildAuthorizeUrl(cfg: GithubConfig, redirectUri: string, state: string): string {
  const url = new URL(`${cfg.baseUrl}/login/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "read:user");
  return url.toString();
}

const tokenSchema = z.object({ access_token: z.string().min(1) });

/** Exchanges the one-time code for an access token. The token is used once and never stored. */
export async function exchangeCode(cfg: GithubConfig, code: string, redirectUri: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GithubError("token request failed");
  }
  if (!res.ok) throw new GithubError(`token endpoint returned ${res.status}`);
  // GitHub answers 200 with { error } for a bad or reused code, which the schema rejects.
  const parsed = tokenSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new GithubError("token response missing access_token");
  return parsed.data.access_token;
}

/** Avatars must be https. Plain http is accepted only when the API itself is a local fake (tests). */
function profileSchema(cfg: GithubConfig) {
  const localFake = cfg.apiUrl.startsWith("http://127.0.0.1");
  return z.object({
    id: z.number().int().positive(),
    login: z.string().min(1).max(100),
    avatar_url: z
      .url()
      .refine((u) => u.startsWith("https://") || (localFake && u.startsWith("http://127.0.0.1")), "avatar must be https"),
  });
}

export interface GithubProfile {
  githubId: number;
  username: string;
  avatarUrl: string;
}

export async function fetchProfile(cfg: GithubConfig, accessToken: string): Promise<GithubProfile> {
  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}/user`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "chagok-todo",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GithubError("profile request failed");
  }
  if (!res.ok) throw new GithubError(`profile endpoint returned ${res.status}`);
  const parsed = profileSchema(cfg).safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new GithubError("profile response invalid");
  return { githubId: parsed.data.id, username: parsed.data.login, avatarUrl: parsed.data.avatar_url };
}

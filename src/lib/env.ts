import "server-only";
import { z } from "zod";

const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.url().optional(),
);
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1, "MONGODB_DB is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // GitHub OAuth App credentials. Optional so build and tests run without them;
  // the OAuth routes report "not configured" when either is missing.
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  // Public origin of this app, e.g. https://example.vercel.app. Defaults to the request origin.
  APP_URL: optionalUrl,
  // Overrides for tests against a fake GitHub. Leave unset in real deployments.
  GITHUB_URL: optionalUrl,
  GITHUB_API_URL: optionalUrl,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated on first call (not at import) so `next build` works without secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Report variable names only, never values.
    const names = [...new Set(result.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Invalid environment variables: ${names.join(", ")}`);
  }
  cached = result.data;
  return cached;
}

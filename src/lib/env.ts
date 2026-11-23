import "server-only";
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1, "MONGODB_DB is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
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

import { existsSync } from "node:fs";

/** Loads .env.local if present; real environment variables take precedence. */
export function loadLocalEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

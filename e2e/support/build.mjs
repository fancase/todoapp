// Builds the production bundle for E2E. A throwaway local URI is injected so that the build can
// never pick up the real database settings from .env.local (process.env wins over .env files).
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalMongoUri } from "./guard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const uri = "mongodb://127.0.0.1:1/e2e-build-only";
assertLocalMongoUri(uri);
const env = {
  ...process.env,
  MONGODB_URI: uri,
  MONGODB_DB: "e2e-build-only",
  SESSION_SECRET: "build-only-secret-0123456789-0123456789",
};
const r = spawnSync(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "build"], {
  cwd: root,
  env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);

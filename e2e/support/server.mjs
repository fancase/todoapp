// Starts an in-memory MongoDB replica set and `next start` against it, for Playwright's webServer.
// The Atlas credentials in .env.local are shadowed by process env (process.env has top priority in Next.js).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { assertLocalMongoUri } from "./guard.mjs";
import { startFakeGithub } from "./fake-github.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = process.env.E2E_PORT ?? "3107";
const GITHUB_PORT = Number(process.env.E2E_GITHUB_PORT ?? "3108");
const runDir = resolve(root, "e2e/.run");

if (!existsSync(resolve(root, ".next/BUILD_ID"))) {
  console.error("No production build found. Run `node e2e/support/build.mjs` first.");
  process.exit(1);
}

const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const db = `e2e_${randomBytes(4).toString("hex")}`;
const uri = repl.getUri(db);
try {
  assertLocalMongoUri(uri);
} catch (e) {
  console.error(String(e.message));
  await repl.stop();
  process.exit(1);
}

const baseURL = `http://127.0.0.1:${PORT}`;
const githubClientId = `e2e-${randomBytes(4).toString("hex")}`;
const githubClientSecret = randomBytes(20).toString("hex");
const github = await startFakeGithub({
  port: GITHUB_PORT,
  appOrigin: baseURL,
  clientId: githubClientId,
  clientSecret: githubClientSecret,
});

const state = {
  baseURL,
  githubUrl: github.url,
  githubClientSecret,
  mongoUri: uri,
  mongoDb: db,
  secret: randomBytes(32).toString("hex"),
};
mkdirSync(runDir, { recursive: true });
writeFileSync(resolve(runDir, "state.json"), JSON.stringify(state));

const child = spawn(
  process.execPath,
  [resolve(root, "node_modules/next/dist/bin/next"), "start", "-p", PORT, "-H", "127.0.0.1"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: uri,
      MONGODB_DB: db,
      SESSION_SECRET: state.secret,
      // Never the real GitHub: the app talks to the local fake for the whole run.
      GITHUB_CLIENT_ID: githubClientId,
      GITHUB_CLIENT_SECRET: githubClientSecret,
      GITHUB_URL: github.url,
      GITHUB_API_URL: github.url,
    },
  },
);

let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  child.kill();
  await github.close().catch(() => {});
  await repl.stop().catch(() => {});
  process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => void shutdown(0));
child.on("exit", (code) => void shutdown(code ?? 1));

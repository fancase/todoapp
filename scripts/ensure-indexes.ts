import { pathToFileURL } from "node:url";
import { MongoClient, type CreateIndexesOptions, type Db, type IndexSpecification } from "mongodb";
import { loadLocalEnv, requireEnv } from "./load-env";

interface IndexDef {
  collection: string;
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}

export const INDEXES: IndexDef[] = [
  { collection: "users", key: { githubId: 1 }, options: { unique: true } },
  // TTL: the session document disappears when expiresAt passes
  { collection: "sessions", key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: "sessions", key: { userId: 1 } },
  { collection: "todos", key: { userId: 1, date: 1, status: 1 } },
  { collection: "todos", key: { userId: 1, weeklyPlanId: 1, status: 1 } },
  { collection: "weeklyPlans", key: { userId: 1, goalId: 1 } },
  { collection: "weeklyPlans", key: { userId: 1, startDate: 1 } },
  { collection: "goals", key: { userId: 1, year: 1 } },
];

/** Single-tenant indexes from before userId existed. Every query now leads with userId. */
export const OBSOLETE_INDEXES: { collection: string; name: string }[] = [
  { collection: "todos", name: "date_1_status_1" },
  { collection: "todos", name: "weeklyPlanId_1_status_1" },
  { collection: "weeklyPlans", name: "goalId_1" },
  { collection: "weeklyPlans", name: "startDate_1" },
  { collection: "goals", name: "year_1" },
  { collection: "loginAttempts", name: "expiresAt_1" },
];

export async function ensureIndexes(db: Db): Promise<void> {
  for (const { collection, key, options } of INDEXES) {
    await db.collection(collection).createIndex(key, options);
  }
  for (const { collection, name } of OBSOLETE_INDEXES) {
    try {
      await db.collection(collection).dropIndex(name);
    } catch (e) {
      // 26 = namespace does not exist, 27 = index not found: both mean already clean.
      const code = (e as { code?: number }).code;
      if (code !== 26 && code !== 27) throw e;
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const client = new MongoClient(requireEnv("MONGODB_URI"), { maxPoolSize: 1 });
  try {
    await ensureIndexes(client.db(requireEnv("MONGODB_DB")));
    console.log(`Indexes ensured (${INDEXES.length}).`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error("ensure-indexes failed:", err instanceof Error ? err.name : "unknown error");
    process.exit(1);
  });
}

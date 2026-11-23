import { pathToFileURL } from "node:url";
import { MongoClient, type Db, type IndexSpecification } from "mongodb";
import { loadLocalEnv, requireEnv } from "./load-env";

interface IndexDef {
  collection: string;
  key: IndexSpecification;
}

export const INDEXES: IndexDef[] = [
  { collection: "todos", key: { date: 1, status: 1 } },
  { collection: "todos", key: { weeklyPlanId: 1, status: 1 } },
  { collection: "weeklyPlans", key: { goalId: 1 } },
  { collection: "weeklyPlans", key: { startDate: 1 } },
  { collection: "goals", key: { year: 1 } },
];

export async function ensureIndexes(db: Db): Promise<void> {
  for (const { collection, key } of INDEXES) {
    await db.collection(collection).createIndex(key);
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

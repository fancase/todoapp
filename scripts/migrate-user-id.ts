import { pathToFileURL } from "node:url";
import { MongoClient, type Db } from "mongodb";
import { loadLocalEnv, requireEnv } from "./load-env";

const COLLECTIONS = ["todos", "weeklyPlans", "goals"] as const;

export type MigrationCounts = Record<(typeof COLLECTIONS)[number], number>;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Assigns every document that has no userId to the given GitHub user.
 * The user must already exist (log in once first). Idempotent: documents that already
 * have a userId are never touched, so a second run changes nothing.
 */
export async function migrateUserId(
  db: Db,
  username: string,
  options: { dryRun?: boolean } = {},
): Promise<MigrationCounts> {
  const users = await db
    .collection("users")
    .find({ username: { $regex: `^${escapeRegExp(username)}$`, $options: "i" } })
    .limit(2)
    .toArray();
  if (users.length === 0) {
    throw new Error(`User "${username}" not found. Log in with that GitHub account once, then run again.`);
  }
  if (users.length > 1) throw new Error(`More than one user matches "${username}".`);
  const userId = users[0]._id;

  const orphan = { userId: { $exists: false } };
  const counts = { todos: 0, weeklyPlans: 0, goals: 0 } as MigrationCounts;
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    counts[name] = options.dryRun
      ? await col.countDocuments(orphan)
      : (await col.updateMany(orphan, { $set: { userId } })).modifiedCount;
  }
  return counts;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const username = args.find((a) => !a.startsWith("--"));
  if (!username) {
    console.error("Usage: npm run db:migrate-user -- <github-username> [--dry-run]");
    process.exit(1);
  }
  loadLocalEnv();
  const client = new MongoClient(requireEnv("MONGODB_URI"), { maxPoolSize: 1 });
  try {
    const counts = await migrateUserId(client.db(requireEnv("MONGODB_DB")), username, { dryRun });
    const verb = dryRun ? "Would assign" : "Assigned";
    console.log(
      `${verb} to ${username}: todos=${counts.todos}, weeklyPlans=${counts.weeklyPlans}, goals=${counts.goals}`,
    );
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error("migrate-user-id failed:", err instanceof Error ? err.message : "unknown error");
    process.exit(1);
  });
}

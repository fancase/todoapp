import { MongoClient } from "mongodb";
import { loadLocalEnv, requireEnv } from "./load-env";

async function main(): Promise<void> {
  loadLocalEnv();
  const client = new MongoClient(requireEnv("MONGODB_URI"), {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
  });
  try {
    await client.db(requireEnv("MONGODB_DB")).command({ ping: 1 });
    console.log("DB connection: success");
  } finally {
    await client.close();
  }
}

main().catch(() => {
  // Never print the error message: it can contain the connection string.
  console.error("DB connection: failure");
  process.exit(1);
});

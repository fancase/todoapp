import "server-only";
import { MongoClient, type Db } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";
import { getEnv } from "@/lib/env";

const globalForMongo = globalThis as unknown as {
  _mongoClient?: MongoClient;
};

function getClient(): MongoClient {
  if (!globalForMongo._mongoClient) {
    const client = new MongoClient(getEnv().MONGODB_URI, { maxPoolSize: 5, maxIdleTimeMS: 5000 });
    attachDatabasePool(client);
    globalForMongo._mongoClient = client;
  }
  return globalForMongo._mongoClient;
}

export function getDb(): Db {
  return getClient().db(getEnv().MONGODB_DB);
}

/** Exposed for multi-document transactions (client.withSession). */
export { getClient };

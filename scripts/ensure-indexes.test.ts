import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ensureIndexes } from "./ensure-indexes";

let mongod: MongoMemoryServer;
let client: MongoClient;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("ensureIndexes", () => {
  it("creates the per-user indexes, a unique githubId, and a TTL on sessions", async () => {
    const db = client.db("test");
    await ensureIndexes(db);
    await ensureIndexes(db); // idempotent

    const list = async (c: string) =>
      (await db.collection(c).indexes()).filter((i) => i.name !== "_id_");

    const users = await list("users");
    expect(users).toHaveLength(1);
    expect(users[0].key).toEqual({ githubId: 1 });
    expect(users[0].unique).toBe(true);

    const sessions = await list("sessions");
    expect(sessions).toHaveLength(2);
    const ttl = sessions.find((i) => i.key.expiresAt === 1)!;
    expect(ttl.expireAfterSeconds).toBe(0);
    expect(sessions.map((i) => i.key)).toEqual(expect.arrayContaining([{ userId: 1 }]));

    const todos = await list("todos");
    expect(todos).toHaveLength(2);
    expect(todos.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        { userId: 1, date: 1, status: 1 },
        { userId: 1, weeklyPlanId: 1, status: 1 },
      ]),
    );

    const plans = await list("weeklyPlans");
    expect(plans).toHaveLength(2);
    expect(plans.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        { userId: 1, goalId: 1 },
        { userId: 1, startDate: 1 },
      ]),
    );

    expect((await list("goals")).map((i) => i.key)).toEqual([{ userId: 1, year: 1 }]);
  });

  it("drops the old single-tenant indexes and tolerates collections that never existed", async () => {
    const db = client.db("legacy");
    await db.collection("todos").createIndex({ date: 1, status: 1 });
    await db.collection("goals").createIndex({ year: 1 });
    await db.collection("loginAttempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await ensureIndexes(db);

    const names = async (c: string) => (await db.collection(c).indexes()).map((i) => i.name);
    expect(await names("todos")).not.toContain("date_1_status_1");
    expect(await names("goals")).not.toContain("year_1");
    expect(await names("goals")).toContain("userId_1_year_1");
    expect(await names("loginAttempts")).not.toContain("expiresAt_1");
  });
});

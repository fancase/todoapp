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
  it("creates the planned indexes", async () => {
    const db = client.db("test");
    await ensureIndexes(db);
    await ensureIndexes(db); // idempotent

    const list = async (c: string) =>
      (await db.collection(c).indexes()).filter((i) => i.name !== "_id_");

    const todos = await list("todos");
    expect(todos).toHaveLength(2);
    expect(todos.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        { date: 1, status: 1 },
        { weeklyPlanId: 1, status: 1 },
      ]),
    );

    const plans = await list("weeklyPlans");
    expect(plans).toHaveLength(2);
    expect(plans.map((i) => i.key)).toEqual(
      expect.arrayContaining([{ goalId: 1 }, { startDate: 1 }]),
    );

    expect((await list("goals")).map((i) => i.key)).toEqual([{ year: 1 }]);
  });
});

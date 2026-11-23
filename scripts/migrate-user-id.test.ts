import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { migrateUserId } from "./migrate-user-id";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("migrate");
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

const owner = new ObjectId();
const other = new ObjectId();

beforeEach(async () => {
  await Promise.all(["users", "todos", "weeklyPlans", "goals"].map((c) => db.collection(c).deleteMany({})));
  await db.collection("users").insertMany([
    { _id: owner, githubId: 1, username: "OctoCat", avatarUrl: "https://x/1" },
    { _id: other, githubId: 2, username: "someone-else", avatarUrl: "https://x/2" },
  ]);
  await db.collection("todos").insertMany([{ title: "old 1" }, { title: "old 2" }, { title: "theirs", userId: other }]);
  await db.collection("weeklyPlans").insertMany([{ title: "old plan" }]);
  await db.collection("goals").insertMany([{ title: "old goal" }, { title: "theirs", userId: other }]);
});

describe("migrateUserId", () => {
  it("assigns only documents without a userId, matching the username case-insensitively", async () => {
    const counts = await migrateUserId(db, "octocat");
    expect(counts).toEqual({ todos: 2, weeklyPlans: 1, goals: 1 });
    for (const c of ["todos", "weeklyPlans", "goals"]) {
      expect(await db.collection(c).countDocuments({ userId: { $exists: false } })).toBe(0);
    }
    expect(await db.collection("todos").countDocuments({ userId: owner })).toBe(2);
    // Documents that already had an owner are untouched.
    expect((await db.collection("todos").findOne({ title: "theirs" }))!.userId.equals(other)).toBe(true);
    expect((await db.collection("goals").findOne({ title: "theirs" }))!.userId.equals(other)).toBe(true);
  });

  it("is idempotent: a second run changes nothing", async () => {
    await migrateUserId(db, "octocat");
    const before = JSON.stringify(await db.collection("todos").find().sort({ _id: 1 }).toArray());
    expect(await migrateUserId(db, "octocat")).toEqual({ todos: 0, weeklyPlans: 0, goals: 0 });
    expect(JSON.stringify(await db.collection("todos").find().sort({ _id: 1 }).toArray())).toBe(before);
  });

  it("a dry run reports the counts and changes nothing", async () => {
    expect(await migrateUserId(db, "octocat", { dryRun: true })).toEqual({ todos: 2, weeklyPlans: 1, goals: 1 });
    expect(await db.collection("todos").countDocuments({ userId: { $exists: false } })).toBe(2);
  });

  it("fails without touching anything when the user has never logged in", async () => {
    await expect(migrateUserId(db, "nobody")).rejects.toThrow(/not found/);
    expect(await db.collection("todos").countDocuments({ userId: { $exists: false } })).toBe(2);
    expect(await db.collection("weeklyPlans").countDocuments({ userId: { $exists: false } })).toBe(1);
  });

  it("treats regex characters in the username literally", async () => {
    await expect(migrateUserId(db, ".*")).rejects.toThrow(/not found/);
    expect(await db.collection("todos").countDocuments({ userId: { $exists: false } })).toBe(2);
  });
});

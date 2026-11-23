import "server-only";
import type { ObjectId } from "mongodb";
import type { CurrentUserDto, User } from "@/domain/types";
import { usersCol } from "@/lib/collections";
import type { GithubProfile } from "@/lib/github";

const DUPLICATE_KEY = 11000;

async function upsertOnce(profile: GithubProfile): Promise<User> {
  const now = new Date();
  const user = await usersCol().findOneAndUpdate(
    { githubId: profile.githubId },
    {
      $set: { username: profile.username, avatarUrl: profile.avatarUrl, lastLoginAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!user) throw new Error("user upsert returned no document");
  return user;
}

/**
 * Creates the user on first login, then keeps username and avatar current. Keyed by GitHub's numeric id.
 * Two first-time logins racing each other can both try to insert; the unique index rejects the loser,
 * which then simply updates the winner's document.
 */
export async function upsertGithubUser(profile: GithubProfile): Promise<User> {
  try {
    return await upsertOnce(profile);
  } catch (e) {
    if ((e as { code?: number }).code !== DUPLICATE_KEY) throw e;
    return upsertOnce(profile);
  }
}

export async function getUserDto(id: ObjectId): Promise<CurrentUserDto | null> {
  const user = await usersCol().findOne({ _id: id });
  return user ? { id: user._id.toHexString(), username: user.username, avatarUrl: user.avatarUrl } : null;
}

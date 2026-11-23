import { cookies } from "next/headers";
import { SESSION_COOKIE, resolveSession } from "@/lib/auth";
import { getUserDto } from "@/server/users";

/**
 * The signed-in user's GitHub avatar and username. Renders nothing without a live session:
 * the data APIs answer 401 in that case and the client sends the person to /login.
 */
export async function UserBadge() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let user = null;
  try {
    const session = await resolveSession(token);
    user = session ? await getUserDto(session.userId) : null;
  } catch {
    // A database hiccup must not take the whole page down; the data calls will report their own errors.
    return null;
  }
  if (!user) return null;
  return (
    <div className="flex items-center gap-2" data-testid="user-badge">
      {/* eslint-disable-next-line @next/next/no-img-element -- GitHub serves a small, already-optimized avatar */}
      <img
        src={user.avatarUrl}
        alt=""
        width={28}
        height={28}
        referrerPolicy="no-referrer"
        data-testid="user-avatar"
        className="size-7 rounded-full bg-muted"
      />
      <span data-testid="user-name" className="max-w-32 truncate text-sm font-medium">
        {user.username}
      </span>
    </div>
  );
}

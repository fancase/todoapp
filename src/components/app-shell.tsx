"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarRange, KanbanSquare, LogOut, Target } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", match: (p: string) => p === "/" || p.startsWith("/board"), label: "보드", Icon: KanbanSquare, id: "board" },
  { href: "/weekly", match: (p: string) => p.startsWith("/weekly"), label: "주간", Icon: CalendarRange, id: "weekly" },
  { href: "/goals", match: (p: string) => p.startsWith("/goals"), label: "목표", Icon: Target, id: "goals" },
] as const;

export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  return (
    <ul className={cn("flex", variant === "top" ? "items-center gap-1" : "w-full items-stretch justify-around")}>
      {NAV.map(({ href, match, label, Icon, id }) => {
        const active = match(pathname);
        return (
          <li key={id} className={variant === "bottom" ? "flex-1" : undefined}>
            <Link
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${id}`}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                variant === "top"
                  ? "rounded-lg px-3 py-2"
                  : "min-h-14 flex-col justify-center gap-1 text-xs",
                active
                  ? variant === "top"
                    ? "bg-primary/10 text-primary"
                    : "text-primary"
                  : "text-muted-foreground hover:text-foreground",
                variant === "top" && !active && "hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  async function logout() {
    setPending(true);
    let loggedOut = false;
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      // 401 means the session is already gone, which is the state we wanted.
      loggedOut = res.ok || res.status === 401;
    } catch {
      loggedOut = false;
    }
    if (!loggedOut) {
      // Stay put: navigating away while the cookie is still valid would only pretend to log out.
      toast.error("로그아웃하지 못했습니다", "잠시 후 다시 시도해 주세요.");
      setPending(false);
      return;
    }
    // Full navigation on purpose: drops all client state (query cache, move queue) with the session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      data-testid="logout-button"
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="hidden sm:inline">로그아웃</span>
      <span className="sr-only sm:hidden">로그아웃</span>
    </button>
  );
}

export function BrandMark() {
  return (
    <Link href="/" prefetch={false} className="flex items-center gap-2 font-bold tracking-tight" data-testid="brand">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"
      >
        <span className="flex flex-col gap-[3px]">
          <span className="block h-[3px] w-3.5 rounded-full bg-current" />
          <span className="ml-1 block h-[3px] w-3.5 rounded-full bg-current opacity-75" />
          <span className="ml-2 block h-[3px] w-2.5 rounded-full bg-current opacity-50" />
        </span>
      </span>
      <span className="text-lg">차곡</span>
    </Link>
  );
}

export function AppShell({
  topNav,
  bottomNav,
  userSlot,
  children,
}: {
  topNav: ReactNode;
  bottomNav: ReactNode;
  userSlot: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <BrandMark />
            <nav aria-label="주 메뉴" className="hidden md:block">
              {topNav}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {userSlot}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-12">{children}</main>
      <nav
        aria-label="하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {bottomNav}
      </nav>
    </div>
  );
}

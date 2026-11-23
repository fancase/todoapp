import { Suspense } from "react";
import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

async function LoginFormWithNext({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  return <LoginForm next={safeNextPath(raw)} />;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"
        >
          <span className="flex flex-col gap-1">
            <span className="block h-1 w-5 rounded-full bg-current" />
            <span className="ml-1.5 block h-1 w-5 rounded-full bg-current opacity-75" />
            <span className="ml-3 block h-1 w-3 rounded-full bg-current opacity-50" />
          </span>
        </span>
        <h1 className="text-2xl font-bold tracking-tight">차곡</h1>
        <p className="text-sm text-muted-foreground">오늘의 할 일부터 1년 목표까지, 차곡차곡 쌓아가세요.</p>
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-xs">
        <Suspense fallback={null}>
          <LoginFormWithNext searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

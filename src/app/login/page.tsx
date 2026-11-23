import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { safeNextPath } from "@/lib/safe-next";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  denied: "GitHub 로그인이 취소되었습니다.",
  state: "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  github: "GitHub와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  not_configured: "GitHub 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요.",
  server: "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function LoginActions({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));
  const errorKey = first(params.error);
  const error = errorKey ? (ERROR_MESSAGES[errorKey] ?? "로그인하지 못했습니다. 다시 시도해 주세요.") : null;
  const href = next === "/" ? "/auth/github" : `/auth/github?next=${encodeURIComponent(next)}`;

  return (
    <div className="flex flex-col gap-4" data-testid="login-form">
      {error && (
        <p role="alert" data-testid="login-error" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {/* A real navigation, not <Link>: prefetching this URL would start an OAuth flow. */}
      <a
        href={href}
        data-testid="login-github"
        className={cn(buttonVariants({ size: "lg" }), "h-10 text-sm font-semibold")}
      >
        GitHub로 로그인
      </a>
    </div>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
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
          <LoginActions searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

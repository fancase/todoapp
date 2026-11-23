import Link from "next/link";
import type { ReactNode } from "react";
import { CircleAlert, Compass, Inbox, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      {eyebrow && <div className="text-sm text-muted-foreground">{eyebrow}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl leading-tight font-bold tracking-tight wrap-anywhere sm:text-3xl">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  testId = "empty-state",
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border border-dashed border-input px-6 py-12 text-center",
        className,
      )}
    >
      <Inbox className="size-7 text-muted-foreground" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  testId = "error-state",
}: {
  message: string;
  onRetry?: () => void;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-card px-6 py-12 text-center"
    >
      <CircleAlert className="size-7 text-destructive" aria-hidden />
      <p className="font-semibold">불러오지 못했습니다</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="lg" className="mt-2" onClick={onRetry} data-testid="retry-button">
          다시 시도
        </Button>
      )}
    </div>
  );
}

export function NotFoundState({
  title = "찾을 수 없습니다",
  description = "주소가 올바른지 확인하거나, 이미 삭제된 항목일 수 있습니다.",
  backHref = "/",
  backLabel = "오늘 보드로 이동",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      data-testid="not-found"
      className="mx-auto flex max-w-md flex-col items-center gap-2 py-20 text-center"
    >
      <Compass className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Link href={backHref} className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-3")}>
        {backLabel}
      </Link>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="불러오는 중" data-testid="loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** Amber warning chip used for out-of-range / out-of-year flags. */
export function WarningNote({
  children,
  testId,
  className,
}: {
  children: ReactNode;
  testId: string;
  className?: string;
}) {
  return (
    <p
      data-testid={testId}
      className={cn(
        "flex items-start gap-1.5 rounded-md bg-warn-soft px-2 py-1 text-xs font-medium text-warn",
        className,
      )}
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

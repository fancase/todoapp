"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressMeter } from "@/components/ui/progress-meter";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  NotFoundState,
  PageHeader,
  WarningNote,
} from "@/components/state-views";
import { StatusBadge } from "@/components/status-badge";
import { useRefetchErrorToast } from "@/components/use-refetch-error-toast";
import { errorMessage, isMissingResource } from "@/lib/api-client";
import { formatRangeKo, formatShortDateKo } from "@/lib/date";
import { useWeeklyPlan } from "@/lib/queries";
import { WeeklyDeleteDialog } from "./weekly-delete-dialog";
import { WeeklyFormDialog } from "./weekly-form-dialog";

export function WeeklyDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const query = useWeeklyPlan(id);
  useRefetchErrorToast(query);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (deleted) return <ListSkeleton rows={1} />;
  if (query.isPending) return <ListSkeleton rows={2} />;
  if (query.isError && (query.data === undefined || isMissingResource(query.error))) {
    if (isMissingResource(query.error)) {
      return (
        <NotFoundState
          title="주간 계획을 찾을 수 없습니다"
          description="삭제되었거나 주소가 올바르지 않습니다."
          backHref="/weekly"
          backLabel="주간 계획 목록으로"
        />
      );
    }
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const plan = query.data;
  if (plan === undefined) return <ListSkeleton rows={2} />;
  return (
    <div data-testid="weekly-detail" data-plan-id={plan.id}>
      <PageHeader
        title={plan.title}
        eyebrow={
          <Link
            href="/weekly"
            prefetch={false}
            className="inline-flex items-center gap-1 rounded hover:text-foreground hover:underline"
            data-testid="back-to-weekly"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            주간 계획
          </Link>
        }
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => setEditing(true)} data-testid="weekly-edit">
              <Pencil aria-hidden />
              수정
            </Button>
            <Button variant="destructive" size="lg" onClick={() => setDeleting(true)} data-testid="weekly-delete">
              <Trash2 aria-hidden />
              삭제
            </Button>
          </>
        }
      >
        <p className="tabular text-sm text-muted-foreground" data-testid="weekly-range">
          {formatRangeKo(plan.startDate, plan.endDate)}
        </p>
      </PageHeader>

      <section aria-labelledby="progress-heading" className="mb-6 rounded-2xl border bg-card p-5 shadow-xs">
        <h2 id="progress-heading" className="mb-3 text-sm font-semibold text-muted-foreground">
          주간 진행률
        </h2>
        <ProgressMeter
          size="lg"
          percent={plan.progress.percent}
          label={`${plan.title} 진행률`}
          caption={`할 일 ${plan.progress.total}개 중 ${plan.progress.done}개 완료`}
          testIdPrefix="weekly-progress"
        />
        <div className="mt-4 flex flex-col items-start gap-1.5 border-t pt-4">
          <p className="text-xs font-semibold text-muted-foreground">상위 1년 목표</p>
          {plan.goal ? (
            <Link
              href={`/goals/${plan.goal.id}`}
              prefetch={false}
              data-testid="weekly-goal-link"
              className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm hover:underline"
            >
              <Target className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {plan.goal.year}년 · {plan.goal.title}
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="weekly-no-goal">
              연결된 1년 목표가 없습니다.
            </p>
          )}
          {plan.outOfGoalYear && plan.goal && (
            <WarningNote testId="out-of-goal-year-warning">
              계획 기간이 목표 연도({plan.goal.year}년)를 벗어납니다
            </WarningNote>
          )}
        </div>
      </section>

      <section aria-labelledby="todos-heading">
        <h2 id="todos-heading" className="mb-3 text-lg font-semibold">
          연결된 할 일 <span className="tabular text-muted-foreground">{plan.todos.length}</span>
        </h2>
        {plan.todos.length === 0 ? (
          <EmptyState
            testId="weekly-todos-empty"
            title="연결된 할 일이 없습니다"
            description="보드에서 할 일을 만들 때 이 주간 계획을 선택하면 여기에 나타납니다."
          />
        ) : (
          <ul data-testid="weekly-todo-list" className="flex flex-col gap-2">
            {plan.todos.map((todo) => (
              <li
                key={todo.id}
                data-testid="weekly-todo-item"
                data-status={todo.status}
                className="flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium wrap-anywhere">{todo.title}</p>
                  <StatusBadge status={todo.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Link
                    href={`/board/${todo.date}`}
                    prefetch={false}
                    data-testid="weekly-todo-date-link"
                    className="rounded hover:text-foreground hover:underline"
                  >
                    {formatShortDateKo(todo.date)} 보드 보기
                  </Link>
                  {todo.outOfPlanRange && (
                    <WarningNote testId="out-of-plan-range-warning">계획 기간 밖의 날짜입니다</WarningNote>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WeeklyFormDialog open={editing} onOpenChange={setEditing} plan={plan} />
      <WeeklyDeleteDialog
        plan={deleting ? plan : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleted(true);
          router.replace("/weekly");
        }}
      />
    </div>
  );
}

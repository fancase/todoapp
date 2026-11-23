"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { GoalDto } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { ProgressMeter } from "@/components/ui/progress-meter";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/state-views";
import { useRefetchErrorToast } from "@/components/use-refetch-error-toast";
import { errorMessage } from "@/lib/api-client";
import { useGoals } from "@/lib/queries";
import { GoalDeleteDialog, GoalFormDialog } from "./goal-dialogs";

export function GoalsListScreen() {
  const query = useGoals();
  useRefetchErrorToast(query);
  const [form, setForm] = useState<{ goal: GoalDto | null } | null>(null);
  const [toDelete, setToDelete] = useState<GoalDto | null>(null);

  const goals = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => b.year - a.year || a.createdAt.localeCompare(b.createdAt)),
    [query.data],
  );

  return (
    <div>
      <PageHeader
        title="1년 목표"
        eyebrow="연결된 주간 계획의 진행률 평균으로 달성도를 봅니다"
        actions={
          <Button size="lg" onClick={() => setForm({ goal: null })} data-testid="goal-create-button">
            <Plus aria-hidden />
            새 목표
          </Button>
        }
      />

      {query.isPending ? (
        <ListSkeleton />
      ) : query.data === undefined ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : goals.length === 0 ? (
        <EmptyState
          testId="goals-empty"
          title="아직 목표가 없습니다"
          description="올해 이루고 싶은 목표를 하나 만들고, 주간 계획을 연결해 보세요."
          action={
            <Button size="lg" onClick={() => setForm({ goal: null })}>
              <Plus aria-hidden />
              첫 목표 만들기
            </Button>
          }
        />
      ) : (
        <ul data-testid="goal-list" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {goals.map((goal) => (
            <li
              key={goal.id}
              data-testid="goal-item"
              data-goal-id={goal.id}
              className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="tabular text-xs font-semibold text-primary" data-testid="goal-item-year">
                    {goal.year}년
                  </p>
                  <h2 className="text-base leading-snug font-semibold wrap-anywhere">
                    <Link
                      href={`/goals/${goal.id}`}
                      prefetch={false}
                      data-testid="goal-item-link"
                      className="rounded hover:underline"
                    >
                      {goal.title}
                    </Link>
                  </h2>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setForm({ goal })}
                    aria-label={`'${goal.title}' 수정`}
                    data-testid="goal-item-edit"
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToDelete(goal)}
                    aria-label={`'${goal.title}' 삭제`}
                    data-testid="goal-item-delete"
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <ProgressMeter
                percent={goal.progress.percent}
                label={`${goal.title} 진행률`}
                caption={`주간 계획 ${goal.progress.weeklyPlanCount}개 평균`}
                testIdPrefix="goal-progress"
              />
            </li>
          ))}
        </ul>
      )}

      <GoalFormDialog open={form !== null} onOpenChange={(o) => !o && setForm(null)} goal={form?.goal ?? null} />
      <GoalDeleteDialog
        goal={toDelete}
        childCount={toDelete?.progress.weeklyPlanCount ?? 0}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import type { WeeklyPlanDto } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { ProgressMeter } from "@/components/ui/progress-meter";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, WarningNote } from "@/components/state-views";
import { useRefetchErrorToast } from "@/components/use-refetch-error-toast";
import { errorMessage } from "@/lib/api-client";
import { formatRangeKo } from "@/lib/date";
import { useWeeklyPlans } from "@/lib/queries";
import { WeeklyDeleteDialog } from "./weekly-delete-dialog";
import { WeeklyFormDialog } from "./weekly-form-dialog";

export function WeeklyListScreen() {
  const query = useWeeklyPlans();
  useRefetchErrorToast(query);
  const [form, setForm] = useState<{ plan: WeeklyPlanDto | null } | null>(null);
  const [toDelete, setToDelete] = useState<WeeklyPlanDto | null>(null);

  const plans = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id)),
    [query.data],
  );

  return (
    <div>
      <PageHeader
        title="주간 계획"
        eyebrow="할 일을 한 주 단위로 묶어 진행률을 확인합니다"
        actions={
          <Button size="lg" onClick={() => setForm({ plan: null })} data-testid="weekly-create-button">
            <Plus aria-hidden />
            새 주간 계획
          </Button>
        }
      />

      {query.isPending ? (
        <ListSkeleton />
      ) : query.data === undefined ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : plans.length === 0 ? (
        <EmptyState
          testId="weekly-empty"
          title="아직 주간 계획이 없습니다"
          description="한 주의 목표를 만들고 할 일을 연결하면 진행률이 자동으로 계산됩니다."
          action={
            <Button size="lg" onClick={() => setForm({ plan: null })}>
              <Plus aria-hidden />
              첫 주간 계획 만들기
            </Button>
          }
        />
      ) : (
        <ul data-testid="weekly-list" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              data-testid="weekly-item"
              data-plan-id={plan.id}
              className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base leading-snug font-semibold wrap-anywhere">
                    <Link
                      href={`/weekly/${plan.id}`}
                      prefetch={false}
                      data-testid="weekly-item-link"
                      className="rounded hover:underline"
                    >
                      {plan.title}
                    </Link>
                  </h2>
                  <p className="tabular mt-0.5 text-sm text-muted-foreground" data-testid="weekly-item-range">
                    {formatRangeKo(plan.startDate, plan.endDate)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setForm({ plan })}
                    aria-label={`'${plan.title}' 수정`}
                    data-testid="weekly-item-edit"
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToDelete(plan)}
                    aria-label={`'${plan.title}' 삭제`}
                    data-testid="weekly-item-delete"
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>

              <ProgressMeter
                percent={plan.progress.percent}
                label={`${plan.title} 진행률`}
                caption={`${plan.progress.done}/${plan.progress.total} 완료`}
                testIdPrefix="weekly-progress"
              />

              <div className="flex flex-col items-start gap-1.5">
                {plan.goal ? (
                  <Link
                    href={`/goals/${plan.goal.id}`}
                    prefetch={false}
                    data-testid="weekly-goal-link"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Target className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      {plan.goal.year}년 · {plan.goal.title}
                    </span>
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground" data-testid="weekly-no-goal">
                    연결된 1년 목표 없음
                  </span>
                )}
                {plan.outOfGoalYear && plan.goal && (
                  <WarningNote testId="out-of-goal-year-warning">
                    계획 기간이 목표 연도({plan.goal.year}년)를 벗어납니다
                  </WarningNote>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <WeeklyFormDialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        plan={form?.plan ?? null}
      />
      <WeeklyDeleteDialog plan={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

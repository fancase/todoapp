"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
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
import { WeeklyFormDialog } from "@/components/weekly/weekly-form-dialog";
import { useRefetchErrorToast } from "@/components/use-refetch-error-toast";
import { errorMessage, isMissingResource } from "@/lib/api-client";
import { formatRangeKo } from "@/lib/date";
import { useGoal } from "@/lib/queries";
import { GoalDeleteDialog, GoalFormDialog } from "./goal-dialogs";

export function GoalDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const query = useGoal(id);
  useRefetchErrorToast(query);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (deleted) return <ListSkeleton rows={1} />;
  if (query.isPending) return <ListSkeleton rows={2} />;
  if (query.isError && (query.data === undefined || isMissingResource(query.error))) {
    if (isMissingResource(query.error)) {
      return (
        <NotFoundState
          title="목표를 찾을 수 없습니다"
          description="삭제되었거나 주소가 올바르지 않습니다."
          backHref="/goals"
          backLabel="목표 목록으로"
        />
      );
    }
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const goal = query.data;
  if (goal === undefined) return <ListSkeleton rows={2} />;
  return (
    <div data-testid="goal-detail" data-goal-id={goal.id}>
      <PageHeader
        title={goal.title}
        eyebrow={
          <Link
            href="/goals"
            prefetch={false}
            className="inline-flex items-center gap-1 rounded hover:text-foreground hover:underline"
            data-testid="back-to-goals"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            1년 목표
          </Link>
        }
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => setEditing(true)} data-testid="goal-edit">
              <Pencil aria-hidden />
              수정
            </Button>
            <Button variant="destructive" size="lg" onClick={() => setDeleting(true)} data-testid="goal-delete">
              <Trash2 aria-hidden />
              삭제
            </Button>
          </>
        }
      >
        <p className="tabular text-sm font-semibold text-primary" data-testid="goal-year">
          {goal.year}년
        </p>
      </PageHeader>

      <section aria-labelledby="goal-progress-heading" className="mb-6 rounded-2xl border bg-card p-5 shadow-xs">
        <h2 id="goal-progress-heading" className="mb-3 text-sm font-semibold text-muted-foreground">
          연간 진행률
        </h2>
        <ProgressMeter
          size="lg"
          percent={goal.progress.percent}
          label={`${goal.title} 연간 진행률`}
          caption={`연결된 주간 계획 ${goal.progress.weeklyPlanCount}개의 평균`}
          testIdPrefix="goal-progress"
        />
      </section>

      <section aria-labelledby="goal-plans-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="goal-plans-heading" className="text-lg font-semibold">
            연결된 주간 계획 <span className="tabular text-muted-foreground">{goal.weeklyPlans.length}</span>
          </h2>
          <Button variant="outline" size="lg" onClick={() => setAddingPlan(true)} data-testid="goal-add-weekly">
            <Plus aria-hidden />
            주간 계획 추가
          </Button>
        </div>
        {goal.weeklyPlans.length === 0 ? (
          <EmptyState
            testId="goal-plans-empty"
            title="연결된 주간 계획이 없습니다"
            description="주간 계획을 만들면서 이 목표를 선택하면 여기에 나타납니다."
          />
        ) : (
          <ul data-testid="goal-weekly-list" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {goal.weeklyPlans.map((plan) => (
              <li
                key={plan.id}
                data-testid="goal-weekly-item"
                data-plan-id={plan.id}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs"
              >
                <div className="min-w-0">
                  <h3 className="text-base leading-snug font-semibold wrap-anywhere">
                    <Link
                      href={`/weekly/${plan.id}`}
                      prefetch={false}
                      data-testid="goal-weekly-link"
                      className="rounded hover:underline"
                    >
                      {plan.title}
                    </Link>
                  </h3>
                  <p className="tabular mt-0.5 text-sm text-muted-foreground">
                    {formatRangeKo(plan.startDate, plan.endDate)}
                  </p>
                </div>
                <ProgressMeter
                  percent={plan.progress.percent}
                  label={`${plan.title} 진행률`}
                  caption={`${plan.progress.done}/${plan.progress.total} 완료`}
                  testIdPrefix="weekly-progress"
                />
                {plan.outOfGoalYear && (
                  <WarningNote testId="out-of-goal-year-warning" className="self-start">
                    계획 기간이 목표 연도({goal.year}년)를 벗어납니다
                  </WarningNote>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <GoalFormDialog open={editing} onOpenChange={setEditing} goal={goal} />
      <WeeklyFormDialog open={addingPlan} onOpenChange={setAddingPlan} defaultGoal={{ id: goal.id, title: goal.title, year: goal.year }} />
      <GoalDeleteDialog
        goal={deleting ? goal : null}
        childCount={goal.weeklyPlans.length}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleted(true);
          router.replace("/goals");
        }}
      />
    </div>
  );
}

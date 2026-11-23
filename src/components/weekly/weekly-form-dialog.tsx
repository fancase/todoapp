"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ParentGoalSummary, WeeklyPlanDto } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, controlClass } from "@/components/ui/field";
import { ApiRequestError, errorMessage, fieldErrors, isUnauthorized } from "@/lib/api-client";
import { todayInSeoul, weekRangeOf } from "@/lib/date";
import { invalidateAll, useGoals, weeklyPlanApi, type WeeklyPlanInput } from "@/lib/queries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: WeeklyPlanDto | null;
  /** Preselected goal when creating from a goal screen (known before the goals list loads). */
  defaultGoal?: ParentGoalSummary | null;
  onSaved?: (plan: WeeklyPlanDto) => void;
}

export function WeeklyFormDialog({ open, onOpenChange, plan, defaultGoal, onSaved }: Props) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? "주간 계획 수정" : "새 주간 계획"}
      description={plan ? undefined : "기간은 하루 이상이면 됩니다. 1년 목표 연결은 선택입니다."}
      testId="weekly-dialog"
    >
      <WeeklyForm
        key={`${plan?.id ?? "new"}:${defaultGoal?.id ?? ""}`}
        plan={plan ?? null}
        defaultGoal={defaultGoal ?? null}
        onDone={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    </Modal>
  );
}

function WeeklyForm({
  plan,
  defaultGoal,
  onDone,
  onSaved,
}: {
  plan: WeeklyPlanDto | null;
  defaultGoal: ParentGoalSummary | null;
  onDone: () => void;
  onSaved?: (plan: WeeklyPlanDto) => void;
}) {
  const qc = useQueryClient();
  const goals = useGoals();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const week = useMemo(() => weekRangeOf(todayInSeoul()), []);

  const goalOptions = useMemo(() => {
    const options = [...(goals.data ?? [])]
      .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
      .map((g) => ({ id: g.id, label: `${g.year}년 · ${g.title}` }));
    // Keep known links selectable before the goals list has loaded, so submitting early cannot drop them.
    for (const known of [plan?.goal, defaultGoal]) {
      if (known && !options.some((o) => o.id === known.id)) {
        options.unshift({ id: known.id, label: `${known.year}년 · ${known.title}` });
      }
    }
    return options;
  }, [goals.data, plan, defaultGoal]);

  const mutation = useMutation({
    mutationFn: async (values: WeeklyPlanInput) => {
      if (!plan) return (await weeklyPlanApi.create(values)).weeklyPlan;
      const patch: Partial<WeeklyPlanInput> = {};
      if (values.title !== plan.title) patch.title = values.title;
      if (values.startDate !== plan.startDate) patch.startDate = values.startDate;
      if (values.endDate !== plan.endDate) patch.endDate = values.endDate;
      if (values.goalId !== plan.goalId) patch.goalId = values.goalId;
      if (Object.keys(patch).length === 0) return plan;
      return (await weeklyPlanApi.patch(plan.id, patch)).weeklyPlan;
    },
    onSuccess: (saved) => {
      void invalidateAll(qc);
      onSaved?.(saved);
      onDone();
    },
    onError: (error) => {
      if (isUnauthorized(error)) return;
      const byField = fieldErrors(error);
      setErrors(byField);
      setFormError(
        Object.keys(byField).length > 0 && error instanceof ApiRequestError && error.code === "VALIDATION_ERROR"
          ? "입력값을 확인해 주세요."
          : errorMessage(error),
      );
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setErrors({});
    setFormError(null);
    mutation.mutate({
      title: String(data.get("title") ?? ""),
      startDate: String(data.get("startDate") ?? ""),
      endDate: String(data.get("endDate") ?? ""),
      goalId: String(data.get("goalId") ?? "") || null,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="weekly-form" className="flex flex-col gap-4">
      <Field label="제목" name="title" error={errors.title} required>
        <input
          name="title"
          type="text"
          autoFocus
          autoComplete="off"
          maxLength={200}
          defaultValue={plan?.title ?? ""}
          placeholder="예: 11월 4주차"
          data-testid="weekly-title-input"
          className={controlClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="시작일" name="startDate" error={errors.startDate} required>
          <input
            name="startDate"
            type="date"
            defaultValue={plan?.startDate ?? week.start}
            data-testid="weekly-start-input"
            className={controlClass}
          />
        </Field>
        <Field label="종료일" name="endDate" error={errors.endDate} required>
          <input
            name="endDate"
            type="date"
            defaultValue={plan?.endDate ?? week.end}
            data-testid="weekly-end-input"
            className={controlClass}
          />
        </Field>
      </div>
      <Field
        label="1년 목표 (선택)"
        name="goalId"
        error={errors.goalId}
        hint={goals.isError ? "목표 목록을 불러오지 못했습니다." : undefined}
      >
        <select
          name="goalId"
          defaultValue={plan?.goalId ?? defaultGoal?.id ?? ""}
          data-testid="weekly-goal-select"
          className={controlClass}
        >
          <option value="">연결 안 함</option>
          {goalOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {formError && (
        <p role="alert" data-testid="form-error" className="text-sm font-medium text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onDone} disabled={mutation.isPending}>
          취소
        </Button>
        <Button type="submit" size="lg" disabled={mutation.isPending} data-testid="weekly-submit">
          {mutation.isPending ? "저장 중..." : plan ? "저장" : "만들기"}
        </Button>
      </div>
    </form>
  );
}

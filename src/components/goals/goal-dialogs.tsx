"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GoalDto } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Field, controlClass } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { ApiRequestError, errorMessage, fieldErrors, isUnauthorized } from "@/lib/api-client";
import { todayInSeoul } from "@/lib/date";
import { goalApi, invalidateAll, type GoalInput } from "@/lib/queries";

interface FormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalDto | null;
}

export function GoalFormDialog({ open, onOpenChange, goal }: FormProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "목표 수정" : "새 1년 목표"}
      description={goal ? undefined : "한 해 동안 이루고 싶은 목표를 적어 보세요."}
      testId="goal-dialog"
    >
      <GoalForm key={goal?.id ?? "new"} goal={goal ?? null} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function GoalForm({ goal, onDone }: { goal: GoalDto | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (values: GoalInput) => {
      if (!goal) return (await goalApi.create(values)).goal;
      const patch: Partial<GoalInput> = {};
      if (values.title !== goal.title) patch.title = values.title;
      if (values.year !== goal.year) patch.year = values.year;
      if (Object.keys(patch).length === 0) return goal;
      return (await goalApi.patch(goal.id, patch)).goal;
    },
    onSuccess: () => {
      void invalidateAll(qc);
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
    const rawYear = String(data.get("year") ?? "").trim();
    // A non-numeric year is sent as NaN-free garbage so the server reports the field error.
    const year = rawYear === "" ? Number.NaN : Number(rawYear);
    if (Number.isNaN(year)) {
      setErrors({ year: "연도를 숫자로 입력하세요" });
      setFormError("입력값을 확인해 주세요.");
      return;
    }
    mutation.mutate({ title: String(data.get("title") ?? ""), year });
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="goal-form" className="flex flex-col gap-4">
      <Field label="제목" name="title" error={errors.title} required>
        <input
          name="title"
          type="text"
          autoFocus
          autoComplete="off"
          maxLength={200}
          defaultValue={goal?.title ?? ""}
          placeholder="예: 매일 운동 습관 만들기"
          data-testid="goal-title-input"
          className={controlClass}
        />
      </Field>
      <Field label="연도" name="year" error={errors.year} required>
        <input
          name="year"
          type="number"
          inputMode="numeric"
          defaultValue={goal?.year ?? Number(todayInSeoul().slice(0, 4))}
          data-testid="goal-year-input"
          className={controlClass}
        />
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
        <Button type="submit" size="lg" disabled={mutation.isPending} data-testid="goal-submit">
          {mutation.isPending ? "저장 중..." : goal ? "저장" : "만들기"}
        </Button>
      </div>
    </form>
  );
}

interface DeleteProps {
  goal: GoalDto | null;
  /** Number of weekly plans that will be unlinked. */
  childCount: number;
  onClose: () => void;
  onDeleted?: () => void;
}

export function GoalDeleteDialog({ goal, childCount, onClose, onDeleted }: DeleteProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (g: GoalDto) => goalApi.remove(g.id),
    onSuccess: () => {
      onDeleted?.();
      void invalidateAll(qc);
      toast.success("목표를 삭제했습니다");
      onClose();
    },
  });
  return (
    <ConfirmDialog
      open={goal !== null}
      onOpenChange={(o) => {
        if (!o) {
          mutation.reset();
          onClose();
        }
      }}
      title="목표를 삭제할까요?"
      description={
        <>
          <p>
            <strong className="text-foreground">{goal?.title}</strong> 목표가 삭제됩니다.
          </p>
          <p data-testid="delete-impact">
            {childCount > 0
              ? `연결된 주간 계획 ${childCount}개는 삭제되지 않고 그대로 남으며, 연결만 해제됩니다.`
              : "연결된 주간 계획이 없습니다."}
          </p>
        </>
      }
      confirmLabel="삭제"
      pending={mutation.isPending}
      error={mutation.isError && !isUnauthorized(mutation.error) ? errorMessage(mutation.error) : null}
      onConfirm={() => goal && mutation.mutate(goal)}
      testId="delete-goal-dialog"
    />
  );
}

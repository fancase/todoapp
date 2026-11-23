"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TodoDto, TodoStatus } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, controlClass } from "@/components/ui/field";
import { useMoveQueue } from "@/components/providers";
import { ApiRequestError, errorMessage, fieldErrors, isUnauthorized } from "@/lib/api-client";
import { formatRangeKo } from "@/lib/date";
import { invalidateAll, todoApi, useWeeklyPlans, type TodoInput } from "@/lib/queries";
import { STATUSES, STATUS_LABEL, isStatus } from "./dnd";

interface TodoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  todo?: TodoDto | null;
  defaultDate: string;
  defaultStatus?: TodoStatus;
}

export function TodoFormDialog({ open, onOpenChange, todo, defaultDate, defaultStatus }: TodoFormDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={todo ? "할 일 수정" : "새 할 일"}
      description={todo ? undefined : "제목과 날짜를 입력하세요. 주간 계획 연결은 선택입니다."}
      testId="todo-dialog"
    >
      {/* Mounted only while open, so form and error state reset on every open. */}
      <TodoForm
        key={`${todo?.id ?? "new"}:${defaultStatus ?? "todo"}`}
        todo={todo ?? null}
        defaultDate={defaultDate}
        defaultStatus={defaultStatus ?? "todo"}
        onDone={() => onOpenChange(false)}
      />
    </Modal>
  );
}

function TodoForm({
  todo,
  defaultDate,
  defaultStatus,
  onDone,
}: {
  todo: TodoDto | null;
  defaultDate: string;
  defaultStatus: TodoStatus;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const queue = useMoveQueue();
  const plans = useWeeklyPlans();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const planOptions = useMemo(() => {
    const list = [...(plans.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const options = list.map((p) => ({
      id: p.id,
      label: `${p.title} (${formatRangeKo(p.startDate, p.endDate)})`,
    }));
    // Keep the current link selectable even before the plan list has loaded.
    if (todo?.weeklyPlan && !options.some((o) => o.id === todo.weeklyPlan!.id)) {
      options.unshift({ id: todo.weeklyPlan.id, label: todo.weeklyPlan.title });
    }
    return options;
  }, [plans.data, todo]);

  const mutation = useMutation({
    mutationFn: async (values: {
      title: string;
      date: string;
      status: TodoStatus;
      weeklyPlanId: string | null;
    }) => {
      if (!todo) {
        const input: TodoInput = { ...values };
        return todoApi.create(input);
      }
      const patch: Partial<TodoInput> = {};
      if (values.title !== todo.title) patch.title = values.title;
      if (values.date !== todo.date) patch.date = values.date;
      if (values.weeklyPlanId !== todo.weeklyPlanId) patch.weeklyPlanId = values.weeklyPlanId;
      if (Object.keys(patch).length > 0) await todoApi.patch(todo.id, patch);
      // Status changes go through the per-card queue so they stay ordered with drags.
      if (values.status !== todo.status) queue.move(todo.id, todo.status, values.status);
      return null;
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
    const rawStatus = String(data.get("status") ?? "todo");
    setErrors({});
    setFormError(null);
    mutation.mutate({
      title: String(data.get("title") ?? ""),
      date: String(data.get("date") ?? ""),
      status: isStatus(rawStatus) ? rawStatus : "todo",
      weeklyPlanId: String(data.get("weeklyPlanId") ?? "") || null,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="todo-form" className="flex flex-col gap-4">
      <Field label="제목" name="title" error={errors.title} required>
        <input
          name="title"
          type="text"
          autoFocus
          autoComplete="off"
          maxLength={200}
          defaultValue={todo?.title ?? ""}
          placeholder="예: 기획서 초안 작성"
          data-testid="todo-title-input"
          className={controlClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="날짜" name="date" error={errors.date} required>
          <input
            name="date"
            type="date"
            defaultValue={todo?.date ?? defaultDate}
            data-testid="todo-date-input"
            className={controlClass}
          />
        </Field>
        <Field label="상태" name="status" error={errors.status}>
          <select
            name="status"
            defaultValue={todo?.status ?? defaultStatus}
            data-testid="todo-status-select"
            className={controlClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="주간 계획 (선택)"
        name="weeklyPlanId"
        error={errors.weeklyPlanId}
        hint={plans.isError ? "주간 계획 목록을 불러오지 못했습니다." : undefined}
      >
        <select
          name="weeklyPlanId"
          defaultValue={todo?.weeklyPlanId ?? ""}
          data-testid="todo-plan-select"
          className={controlClass}
        >
          <option value="">연결 안 함</option>
          {planOptions.map((o) => (
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
        <Button type="submit" size="lg" disabled={mutation.isPending} data-testid="todo-submit">
          {mutation.isPending ? "저장 중..." : todo ? "저장" : "추가"}
        </Button>
      </div>
    </form>
  );
}

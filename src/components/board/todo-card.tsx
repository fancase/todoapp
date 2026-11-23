"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CalendarRange, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { TodoDto } from "@/domain/types";
import { WarningNote } from "@/components/state-views";
import { formatRangeKo } from "@/lib/date";
import { cn } from "@/lib/utils";

interface CardBodyProps {
  todo: TodoDto;
  pending?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  handleProps?: Record<string, unknown>;
  setHandleRef?: (el: HTMLElement | null) => void;
}

const STATUS_STRIPE: Record<TodoDto["status"], string> = {
  todo: "bg-status-todo",
  doing: "bg-status-doing",
  done: "bg-status-done",
};

/** Presentational card, shared by the in-column draggable and the drag overlay. */
export function TodoCardBody({ todo, pending, onEdit, onDelete, handleProps, setHandleRef }: CardBodyProps) {
  return (
    <div className="relative flex gap-1 overflow-hidden rounded-xl border bg-card py-3 pr-2 pl-1 shadow-xs">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", STATUS_STRIPE[todo.status])} />
      <button
        type="button"
        ref={setHandleRef}
        data-testid="todo-handle"
        aria-label={`'${todo.title}' 카드 이동`}
        className="mt-0.5 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        {...handleProps}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <div className="min-w-0 flex-1 pr-1">
        <p
          data-testid="todo-card-title"
          className={cn(
            "text-sm leading-snug font-medium wrap-anywhere",
            todo.status === "done" && "text-muted-foreground line-through decoration-1",
          )}
        >
          {todo.title}
        </p>
        <div className="mt-1.5 flex flex-col items-start gap-1.5">
          {todo.weeklyPlan && (
            <Link
              href={`/weekly/${todo.weeklyPlan.id}`}
              prefetch={false}
              data-testid="todo-plan-link"
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <CalendarRange className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{todo.weeklyPlan.title}</span>
            </Link>
          )}
          {todo.outOfPlanRange && todo.weeklyPlan && (
            <WarningNote testId="out-of-plan-range-warning">
              이 날짜는 주간 계획 기간({formatRangeKo(todo.weeklyPlan.startDate, todo.weeklyPlan.endDate)}) 밖입니다
            </WarningNote>
          )}
          {pending && (
            <span data-testid="todo-saving" className="text-xs text-muted-foreground" role="status">
              저장 중...
            </span>
          )}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-start">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              data-testid="todo-edit"
              aria-label={`'${todo.title}' 수정`}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              data-testid="todo-delete"
              aria-label={`'${todo.title}' 삭제`}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface TodoCardProps {
  todo: TodoDto;
  pending: boolean;
  onEdit: (todo: TodoDto) => void;
  onDelete: (todo: TodoDto) => void;
}

export function TodoCard({ todo, pending, onEdit, onDelete }: TodoCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: todo.id,
  });
  // Pointer/touch listeners sit on the whole card; keyboard activation is limited to the handle.
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      data-testid="todo-card"
      data-todo-id={todo.id}
      data-status={todo.status}
      data-pending={pending ? "true" : undefined}
      aria-busy={pending || undefined}
      className={cn("list-none select-none", isDragging && "opacity-40")}
    >
      <TodoCardBody
        todo={todo}
        pending={pending}
        onEdit={() => onEdit(todo)}
        onDelete={() => onDelete(todo)}
        handleProps={attributes as unknown as Record<string, unknown>}
        setHandleRef={setActivatorNodeRef}
      />
    </li>
  );
}

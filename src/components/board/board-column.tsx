"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { TodoDto, TodoStatus } from "@/domain/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./dnd";
import { TodoCard } from "./todo-card";

const DOT: Record<TodoStatus, string> = {
  todo: "bg-status-todo",
  doing: "bg-status-doing",
  done: "bg-status-done",
};

const TINT: Record<TodoStatus, string> = {
  todo: "bg-status-todo-soft/60",
  doing: "bg-status-doing-soft/60",
  done: "bg-status-done-soft/60",
};

interface BoardColumnProps {
  status: TodoStatus;
  todos: TodoDto[];
  pendingIds: ReadonlySet<string>;
  onAdd: (status: TodoStatus) => void;
  onEdit: (todo: TodoDto) => void;
  onDelete: (todo: TodoDto) => void;
}

export function BoardColumn({ status, todos, pendingIds, onAdd, onEdit, onDelete }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const headingId = `column-heading-${status}`;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-testid={`board-column-${status}`}
      data-status={status}
      data-over={isOver ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border p-3 transition-colors",
        TINT[status],
        isOver && "border-primary ring-2 ring-primary/30",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className={cn("size-2.5 rounded-full", DOT[status])} />
          {STATUS_LABEL[status]}
          <span
            data-testid={`column-count-${status}`}
            className="tabular rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {todos.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => onAdd(status)}
          data-testid={`add-todo-${status}`}
          aria-label={`${STATUS_LABEL[status]} 칸에 할 일 추가`}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      <ul
        data-testid={`column-list-${status}`}
        className="flex min-h-24 flex-1 flex-col gap-2"
        aria-label={`${STATUS_LABEL[status]} 목록`}
      >
        {todos.map((todo) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            pending={pendingIds.has(todo.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        {todos.length === 0 && (
          <li
            aria-hidden
            data-testid={`column-empty-${status}`}
            className="grid flex-1 place-items-center rounded-xl border border-dashed border-input px-3 py-6 text-center text-xs text-muted-foreground"
          >
            카드를 여기로 끌어다 놓으세요
          </li>
        )}
      </ul>
    </section>
  );
}

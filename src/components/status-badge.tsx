import type { TodoStatus } from "@/domain/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/components/board/dnd";

const STYLE: Record<TodoStatus, string> = {
  todo: "bg-status-todo-soft text-status-todo",
  doing: "bg-status-doing-soft text-status-doing",
  done: "bg-status-done-soft text-status-done",
};

const DOT: Record<TodoStatus, string> = {
  todo: "bg-status-todo",
  doing: "bg-status-doing",
  done: "bg-status-done",
};

export function StatusBadge({ status }: { status: TodoStatus }) {
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", STYLE[status])}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

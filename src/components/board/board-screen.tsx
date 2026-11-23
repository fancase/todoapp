"use client";

import { useMemo, useRef, useState } from "react";
import { useRefetchErrorToast } from "@/components/use-refetch-error-toast";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { TodoDto, TodoStatus } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { controlClass } from "@/components/ui/field";
import { ErrorState, PageHeader, Skeleton } from "@/components/state-views";
import { useMoveQueue, usePendingMoves } from "@/components/providers";
import { useToast } from "@/components/toast";
import { errorMessage, isUnauthorized } from "@/lib/api-client";
import { formatDateKo, parseJumpDate, shiftDate, todayInSeoul } from "@/lib/date";
import { invalidateAll, todoApi, useTodos } from "@/lib/queries";
import { BoardColumn } from "./board-column";
import {
  MousePointerSensor,
  STATUSES,
  buildAnnouncements,
  columnCoordinateGetter,
  isStatus,
  screenReaderInstructions,
} from "./dnd";
import { TodoCardBody } from "./todo-card";
import { TodoFormDialog } from "./todo-form-dialog";

const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

const byCreated = (a: TodoDto, b: TodoDto) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function BoardSkeleton() {
  return (
    <div role="status" aria-label="보드를 불러오는 중" data-testid="loading">
      <Skeleton className="mb-6 h-9 w-64" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUSES.map((s) => (
          <Skeleton key={s} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Date field with a local draft.
 * - Typing (any key press in the field) never navigates per keystroke: it commits on Enter or blur.
 * - A change with no typing in progress (native calendar popup, programmatic fill) commits at once.
 * - Only real dates in 2000-2100 navigate; anything else reverts to the current date.
 */
function DateJump({ date, onGo }: { date: string; onGo: (next: string) => void }) {
  const [draft, setDraft] = useState(date);
  const typing = useRef(false);
  const navigatedTo = useRef<string | null>(null);

  function commit(value: string) {
    typing.current = false;
    const next = parseJumpDate(value);
    if (next === null) {
      setDraft(date);
      return;
    }
    // Skip no-ops and a blur that follows a value we already navigated to.
    if (next === date || next === navigatedTo.current) return;
    navigatedTo.current = next;
    onGo(next);
  }

  return (
    <>
      <label className="sr-only" htmlFor="board-date-input">
        날짜 선택
      </label>
      <input
        id="board-date-input"
        type="date"
        value={draft}
        min="2000-01-01"
        max="2100-12-31"
        onPointerDown={() => {
          typing.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
          } else if (!e.altKey && !["Tab", "Escape", "Shift", "Control", "Alt", "Meta"].includes(e.key)) {
            // Alt+Down opens the native popup, so it does not count as typing.
            typing.current = true;
          }
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!typing.current) commit(e.target.value);
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        data-testid="date-input"
        className={controlClass.replace("w-full", "w-44")}
      />
    </>
  );
}

export function BoardScreen({ date }: { date: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const queue = useMoveQueue();
  const pending = usePendingMoves();
  const query = useTodos(date);
  useRefetchErrorToast(query);

  const [form, setForm] = useState<{ todo: TodoDto | null; status: TodoStatus } | null>(null);
  const [toDelete, setToDelete] = useState<TodoDto | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MousePointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinateGetter }),
  );

  // Display = server data with the user's not-yet-confirmed choices laid over it.
  const items = useMemo(
    () =>
      (query.data ?? [])
        .map((t) => ({ ...t, status: pending.get(t.id) ?? t.status }))
        .sort(byCreated),
    [query.data, pending],
  );
  const columns = useMemo(() => {
    const out: Record<TodoStatus, TodoDto[]> = { todo: [], doing: [], done: [] };
    for (const t of items) out[t.status].push(t);
    return out;
  }, [items]);
  const pendingIds = useMemo(() => new Set(pending.keys()), [pending]);
  const activeTodo = activeId ? (items.find((t) => t.id === activeId) ?? null) : null;

  const announcements = useMemo(
    () =>
      buildAnnouncements(
        (id) => items.find((t) => t.id === id)?.title ?? "할 일",
        (id) => items.find((t) => t.id === id)?.status,
      ),
    [items],
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !isStatus(over.id)) return;
    const todo = query.data?.find((t) => t.id === String(active.id));
    if (!todo) return;
    // Same-column drops are ignored inside the queue: no request, no state change.
    queue.move(todo.id, todo.status, over.id);
  }

  const del = useMutation({
    mutationFn: async (todo: TodoDto) => {
      // Never race DELETE with a status PATCH: drop unsent choices and wait for the in-flight one.
      await queue.settle(todo.id);
      await todoApi.remove(todo.id);
      queue.forget(todo.id);
    },
    onError: () => {
      void invalidateAll(qc);
    },
    onSuccess: () => {
      setToDelete(null);
      void invalidateAll(qc);
      toast.success("할 일을 삭제했습니다");
    },
  });

  const isToday = date === todayInSeoul();

  function go(next: string) {
    router.push(`/board/${next}`);
  }

  return (
    <div data-testid="board" data-date={date}>
      <PageHeader
        title={formatDateKo(date)}
        eyebrow={isToday ? "오늘" : undefined}
        actions={
          <Button size="lg" onClick={() => setForm({ todo: null, status: "todo" })} data-testid="add-todo-button">
            <Plus aria-hidden />
            새 할 일
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="날짜 이동">
          <Button
            variant="outline"
            size="icon-lg"
            onClick={() => go(shiftDate(date, -1))}
            aria-label="이전 날짜"
            data-testid="date-prev"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            onClick={() => go(shiftDate(date, 1))}
            aria-label="다음 날짜"
            data-testid="date-next"
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              // Compared at click time so it stays correct after midnight.
              const now = todayInSeoul();
              if (now !== date) go(now);
            }}
            data-testid="date-today"
          >
            오늘
          </Button>
          <DateJump key={date} date={date} onGo={go} />
        </div>
      </PageHeader>

      {query.isPending ? (
        <BoardSkeleton />
      ) : query.data === undefined ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <DndContext
          id="board-dnd"
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
          accessibility={{ announcements, screenReaderInstructions }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                todos={columns[status]}
                pendingIds={pendingIds}
                onAdd={(s) => setForm({ todo: null, status: s })}
                onEdit={(todo) => setForm({ todo, status: todo.status })}
                onDelete={setToDelete}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTodo ? (
              <div data-testid="drag-overlay" className="rotate-1 shadow-xl">
                <TodoCardBody todo={activeTodo} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {query.data !== undefined && items.length === 0 && (
        <p data-testid="board-empty" className="mt-4 text-center text-sm text-muted-foreground">
          이 날짜에는 할 일이 없습니다. 새 할 일을 추가해 보세요.
        </p>
      )}

      <TodoFormDialog
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        todo={form?.todo ?? null}
        defaultDate={date}
        defaultStatus={form?.status}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && !del.isPending && (setToDelete(null), del.reset())}
        title="할 일을 삭제할까요?"
        description={
          <p>
            <strong className="text-foreground">{toDelete?.title}</strong> 할 일이 삭제됩니다.
            {toDelete?.weeklyPlan && " 연결된 주간 계획의 진행률이 다시 계산됩니다."}
          </p>
        }
        confirmLabel="삭제"
        pending={del.isPending}
        error={del.isError && !isUnauthorized(del.error) ? errorMessage(del.error) : null}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        testId="delete-todo-dialog"
      />
    </div>
  );
}

"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TodoDto } from "@/domain/types";
import { isUnauthorized } from "@/lib/api-client";
import { MoveQueue, type PendingMoves } from "@/lib/move-queue";
import { invalidateAll, queryKeys, shouldRetry, todoApi } from "@/lib/queries";
import { ToastProvider, useToast } from "@/components/toast";

type TodoMoveQueue = MoveQueue<TodoDto>;
const MoveQueueContext = createContext<TodoMoveQueue | null>(null);

function patchTodoEverywhere(qc: QueryClient, todo: TodoDto) {
  qc.setQueriesData<TodoDto[]>({ queryKey: queryKeys.todosAll }, (old) =>
    old?.map((t) => (t.id === todo.id ? todo : t)),
  );
}

function findTitle(qc: QueryClient, id: string): string | undefined {
  for (const [, todos] of qc.getQueriesData<TodoDto[]>({ queryKey: queryKeys.todosAll })) {
    const hit = todos?.find((t) => t.id === id);
    if (hit) return hit.title;
  }
  return undefined;
}

function MoveQueueProvider({ qc, children }: { qc: QueryClient; children: ReactNode }) {
  const toast = useToast();
  // The queue outlives any single screen so an in-flight move survives navigation.
  const [queue] = useState<TodoMoveQueue>(
    () =>
      new MoveQueue<TodoDto>({
        send: async (id, status) => (await todoApi.patch(id, { status })).todo,
        onConfirmed: ({ result }) => {
          patchTodoEverywhere(qc, result);
          void invalidateAll(qc);
        },
        onFailed: ({ id, error, restoredTo }) => {
          if (isUnauthorized(error)) return; // already redirecting to /login
          const title = findTitle(qc, id);
          const subject = title ? `'${title}'` : "할 일";
          toast.error(
            `${subject} 상태를 저장하지 못했습니다`,
            restoredTo
              ? `원래 칸으로 되돌렸습니다. ${error instanceof Error ? error.message : ""}`.trim()
              : error instanceof Error
                ? error.message
                : undefined,
          );
        },
        onIdle: () => {
          void invalidateAll(qc);
        },
      }),
  );
  return <MoveQueueContext.Provider value={queue}>{children}</MoveQueueContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetry, staleTime: 5_000, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MoveQueueProvider qc={qc}>{children}</MoveQueueProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export function useMoveQueue(): TodoMoveQueue {
  const queue = useContext(MoveQueueContext);
  if (!queue) throw new Error("useMoveQueue must be used inside <Providers>");
  return queue;
}

/** Pending (optimistic) statuses by todo id. Re-renders on change. */
export function usePendingMoves(): PendingMoves {
  const queue = useMoveQueue();
  return useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
}

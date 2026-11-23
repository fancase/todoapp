"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "error" | "success";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  error: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      error: (title, description) => push("error", title, description),
      success: (title, description) => push("success", title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
        data-testid="toast-region"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            data-testid={t.kind === "error" ? "toast-error" : "toast-success"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",
              "animate-in fade-in slide-in-from-bottom-2 duration-200",
              t.kind === "error"
                ? "border-destructive/30 bg-card text-foreground"
                : "border-emerald-700/25 bg-card text-foreground",
            )}
          >
            {t.kind === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium wrap-anywhere">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-muted-foreground wrap-anywhere">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="알림 닫기"
              className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

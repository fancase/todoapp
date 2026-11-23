"use client";

import { useState, type FormEvent } from "react";
import { safeNextPath } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST" });
      if (res.ok) {
        window.location.assign(safeNextPath(next));
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "로그인에 실패했습니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="login-form">
      {error && (
        <p role="alert" data-testid="login-error" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} autoFocus data-testid="login-submit" className="h-10 text-sm font-semibold">
        {pending ? "들어가는 중..." : "시작하기"}
      </Button>
    </form>
  );
}

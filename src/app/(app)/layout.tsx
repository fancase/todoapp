import { Suspense, type ReactNode } from "react";
import { AppShell, NavLinks } from "@/components/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      topNav={
        <Suspense fallback={null}>
          <NavLinks variant="top" />
        </Suspense>
      }
      bottomNav={
        <Suspense fallback={<div className="h-14" />}>
          <NavLinks variant="bottom" />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BoardSkeleton } from "@/components/board/board-screen";
import { todayInSeoul } from "@/lib/date";

// "Today" depends on the request time, so it is resolved at request time behind Suspense.
async function RedirectToToday(): Promise<never> {
  await connection();
  redirect(`/board/${todayInSeoul()}`);
}

export default function HomePage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <RedirectToToday />
    </Suspense>
  );
}

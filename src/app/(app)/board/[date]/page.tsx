import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardScreen, BoardSkeleton } from "@/components/board/board-screen";
import { NotFoundState } from "@/components/state-views";
import { isRealDate } from "@/domain/schemas";

export const metadata: Metadata = { title: "보드" };

async function BoardRoute({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isRealDate(date)) {
    return (
      <NotFoundState
        title="올바르지 않은 날짜입니다"
        description="날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다."
        backLabel="오늘 보드로 이동"
      />
    );
  }
  return <BoardScreen date={date} />;
}

export default function BoardPage({ params }: PageProps<"/board/[date]">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardRoute params={params} />
    </Suspense>
  );
}

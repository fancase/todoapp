import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/state-views";
import { WeeklyDetailScreen } from "@/components/weekly/weekly-detail-screen";

export const metadata: Metadata = { title: "주간 계획 상세" };

async function WeeklyRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WeeklyDetailScreen id={id} />;
}

export default function WeeklyDetailPage({ params }: PageProps<"/weekly/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <WeeklyRoute params={params} />
    </Suspense>
  );
}

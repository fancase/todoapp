import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalDetailScreen } from "@/components/goals/goal-detail-screen";
import { ListSkeleton } from "@/components/state-views";

export const metadata: Metadata = { title: "목표 상세" };

async function GoalRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoalDetailScreen id={id} />;
}

export default function GoalDetailPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <GoalRoute params={params} />
    </Suspense>
  );
}

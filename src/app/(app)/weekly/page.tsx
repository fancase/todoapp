import type { Metadata } from "next";
import { WeeklyListScreen } from "@/components/weekly/weekly-list-screen";

export const metadata: Metadata = { title: "주간 계획" };

export default function WeeklyPage() {
  return <WeeklyListScreen />;
}

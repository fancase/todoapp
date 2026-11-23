import type { Metadata } from "next";
import { GoalsListScreen } from "@/components/goals/goals-list-screen";

export const metadata: Metadata = { title: "1년 목표" };

export default function GoalsPage() {
  return <GoalsListScreen />;
}

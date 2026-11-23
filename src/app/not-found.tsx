import { NotFoundState } from "@/components/state-views";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4">
      <NotFoundState title="페이지를 찾을 수 없습니다" description="주소가 올바른지 확인해 주세요." />
    </main>
  );
}

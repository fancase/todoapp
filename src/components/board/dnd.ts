import {
  PointerSensor,
  type Announcements,
  type KeyboardCoordinateGetter,
  type PointerSensorOptions,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import type { TodoStatus } from "@/domain/types";

export const STATUSES: readonly TodoStatus[] = ["todo", "doing", "done"];

export const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

export const isStatus = (value: unknown): value is TodoStatus =>
  value === "todo" || value === "doing" || value === "done";

/**
 * Pointer sensor for mouse and pen only. Touch is handled by TouchSensor (long press), so a
 * normal swipe still scrolls the page instead of grabbing a card.
 */
export class MousePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent: event }: { nativeEvent: PointerEvent },
        { onActivation }: PointerSensorOptions,
      ) => {
        if (event.pointerType === "touch" || !event.isPrimary || event.button !== 0) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** Arrow keys jump between columns instead of nudging by pixels. */
export const columnCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, collisionRect }, currentCoordinates },
) => {
  const direction =
    event.code === "ArrowRight" || event.code === "ArrowDown"
      ? 1
      : event.code === "ArrowLeft" || event.code === "ArrowUp"
        ? -1
        : 0;
  if (direction === 0) return undefined;
  event.preventDefault();
  if (!active || !collisionRect) return currentCoordinates;

  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let current = 0;
  let best = Number.POSITIVE_INFINITY;
  STATUSES.forEach((status, i) => {
    const rect = droppableRects.get(status);
    if (!rect) return;
    const d = Math.hypot(rect.left + rect.width / 2 - cx, rect.top + rect.height / 2 - cy);
    if (d < best) {
      best = d;
      current = i;
    }
  });

  const next = Math.min(STATUSES.length - 1, Math.max(0, current + direction));
  const target = droppableRects.get(STATUSES[next]);
  if (!target) return currentCoordinates;
  return {
    x: target.left + Math.max(0, (target.width - collisionRect.width) / 2),
    y: target.top + 12,
  };
};

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "카드를 옮기려면 이동 버튼에서 스페이스 또는 엔터 키를 눌러 집으세요. 방향키로 칸을 고르고, 스페이스 또는 엔터 키로 놓으세요. Esc 키를 누르면 취소합니다.",
};

export function buildAnnouncements(
  titleOf: (id: string) => string,
  statusOf: (id: string) => TodoStatus | undefined,
): Announcements {
  const label = (id: unknown) => (isStatus(id) ? STATUS_LABEL[id] : "알 수 없는");
  return {
    onDragStart({ active }) {
      const id = String(active.id);
      const from = statusOf(id);
      return `'${titleOf(id)}' 카드를 집었습니다. 현재 ${from ? STATUS_LABEL[from] : ""} 칸입니다.`;
    },
    onDragOver({ active, over }) {
      const title = titleOf(String(active.id));
      return over
        ? `'${title}' 카드가 ${label(over.id)} 칸 위에 있습니다.`
        : `'${title}' 카드가 칸 밖에 있습니다.`;
    },
    onDragEnd({ active, over }) {
      const id = String(active.id);
      const title = titleOf(id);
      const from = statusOf(id);
      if (!over || !isStatus(over.id)) return `'${title}' 카드를 칸 밖에 놓아 이동하지 않았습니다.`;
      if (from === over.id) return `'${title}' 카드를 ${label(over.id)} 칸에 그대로 놓았습니다.`;
      return `'${title}' 카드를 ${from ? STATUS_LABEL[from] : ""}에서 ${label(over.id)} 칸으로 옮겼습니다.`;
    },
    onDragCancel({ active }) {
      const id = String(active.id);
      const from = statusOf(id);
      return `이동을 취소했습니다. '${titleOf(id)}' 카드는 ${from ? STATUS_LABEL[from] : ""} 칸에 그대로 있습니다.`;
    },
  };
}

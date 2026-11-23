"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WeeklyPlanDto } from "@/domain/types";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { errorMessage, isUnauthorized } from "@/lib/api-client";
import { invalidateAll, weeklyPlanApi } from "@/lib/queries";

interface Props {
  plan: WeeklyPlanDto | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function WeeklyDeleteDialog({ plan, onClose, onDeleted }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (p: WeeklyPlanDto) => weeklyPlanApi.remove(p.id),
    onSuccess: () => {
      onDeleted?.();
      void invalidateAll(qc);
      toast.success("주간 계획을 삭제했습니다");
      onClose();
    },
  });
  const count = plan?.progress.total ?? 0;
  return (
    <ConfirmDialog
      open={plan !== null}
      onOpenChange={(o) => {
        if (!o) {
          mutation.reset();
          onClose();
        }
      }}
      title="주간 계획을 삭제할까요?"
      description={
        <>
          <p>
            <strong className="text-foreground">{plan?.title}</strong> 계획이 삭제됩니다.
          </p>
          <p data-testid="delete-impact">
            {count > 0
              ? `연결된 할 일 ${count}개는 삭제되지 않고 그대로 남으며, 연결만 해제됩니다.`
              : "연결된 할 일이 없습니다."}
          </p>
        </>
      }
      confirmLabel="삭제"
      pending={mutation.isPending}
      error={mutation.isError && !isUnauthorized(mutation.error) ? errorMessage(mutation.error) : null}
      onConfirm={() => plan && mutation.mutate(plan)}
      testId="delete-weekly-dialog"
    />
  );
}

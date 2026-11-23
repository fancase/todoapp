"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const backdropClass =
  "fixed inset-0 z-50 bg-foreground/35 backdrop-blur-[2px] transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0";

const popupClass =
  "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-popover p-5 text-popover-foreground shadow-xl outline-none transition-[opacity,transform] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  testId?: string;
  children: ReactNode;
}

export function Modal({ open, onOpenChange, title, description, testId, children }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={backdropClass} />
        <DialogPrimitive.Popup className={popupClass} data-testid={testId}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg leading-snug font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="닫기"
              className="-mt-1 -mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  testId?: string;
}

/** Destructive confirmation. Cancel is the safe default focus target. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  testId = "confirm-dialog",
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop className={backdropClass} />
        <AlertDialogPrimitive.Popup className={popupClass} data-testid={testId}>
          <AlertDialogPrimitive.Title className="text-lg leading-snug font-semibold">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description
            render={<div />}
            className="mt-2 space-y-1.5 text-sm text-muted-foreground"
          >
            {description}
          </AlertDialogPrimitive.Description>
          {error && (
            <p role="alert" data-testid="confirm-error" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Close
              render={<Button variant="outline" size="lg" data-testid="confirm-cancel" />}
              disabled={pending}
            >
              취소
            </AlertDialogPrimitive.Close>
            <Button
              variant="destructive"
              size="lg"
              onClick={onConfirm}
              disabled={pending}
              data-testid="confirm-submit"
              className={cn("font-semibold")}
            >
              {pending ? "처리 중..." : confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

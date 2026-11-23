import { displayPercent } from "@/domain/progress";
import { cn } from "@/lib/utils";

interface ProgressMeterProps {
  /** Raw 0-100 percent from the API. Rounded for display only, via displayPercent(). */
  percent: number;
  label: string;
  caption?: string;
  testIdPrefix: string;
  size?: "sm" | "lg";
  className?: string;
}

export function ProgressMeter({
  percent,
  label,
  caption,
  testIdPrefix,
  size = "sm",
  className,
}: ProgressMeterProps) {
  const shown = displayPercent(percent);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        {caption ? (
          <span className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-caption`}>
            {caption}
          </span>
        ) : (
          <span />
        )}
        <span
          data-testid={`${testIdPrefix}-value`}
          className={cn(
            "tabular font-mono font-semibold",
            size === "lg" ? "text-3xl" : "text-sm",
          )}
        >
          {shown}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={`${shown}%`}
        data-testid={`${testIdPrefix}-bar`}
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          size === "lg" ? "h-3" : "h-2",
        )}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, shown))}%` }}
        />
      </div>
    </div>
  );
}

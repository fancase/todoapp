/** Weekly progress = done / total * 100. No todos -> 0. Raw value, not rounded. */
export function weeklyProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  return (done / total) * 100;
}

/** Yearly progress = mean of weekly raw percents (0-todo plans count as 0). No plans -> 0. */
export function yearlyProgress(weeklyPercents: readonly number[]): number {
  if (weeklyPercents.length === 0) return 0;
  return weeklyPercents.reduce((sum, p) => sum + p, 0) / weeklyPercents.length;
}

/** Display-only rounding. */
export function displayPercent(percent: number): number {
  return Math.round(percent);
}

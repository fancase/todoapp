// Pure date helpers. Dates are `YYYY-MM-DD` strings; never round-trip through local time.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const seoulFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Asia/Seoul as YYYY-MM-DD. */
export function todayInSeoul(now: Date = new Date()): string {
  return seoulFormatter.format(now);
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function toUtc(date: string): Date {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(2000, m - 1, d));
  dt.setUTCFullYear(y);
  return dt;
}

function fromUtc(dt: Date): string {
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDate(date: string, days: number): string {
  const dt = toUtc(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

/** 0 = Sunday. */
export function weekdayIndex(date: string): number {
  return toUtc(date).getUTCDay();
}

export function weekdayKo(date: string): string {
  return WEEKDAYS[weekdayIndex(date)];
}

/** `2026년 11월 23일 (월)` */
export function formatDateKo(date: string): string {
  const [y, m, d] = parts(date);
  return `${y}년 ${m}월 ${d}일 (${weekdayKo(date)})`;
}

/** `11월 23일 (월)` */
export function formatShortDateKo(date: string): string {
  const [, m, d] = parts(date);
  return `${m}월 ${d}일 (${weekdayKo(date)})`;
}

/** `2026.11.23 ~ 2026.11.29` */
export function formatRangeKo(start: string, end: string): string {
  return `${start.replaceAll("-", ".")} ~ ${end.replaceAll("-", ".")}`;
}

/** Monday..Sunday range containing `date`. */
export function weekRangeOf(date: string): { start: string; end: string } {
  const offsetFromMonday = (weekdayIndex(date) + 6) % 7;
  const start = shiftDate(date, -offsetFromMonday);
  return { start, end: shiftDate(start, 6) };
}

export const JUMP_MIN_YEAR = 2000;
export const JUMP_MAX_YEAR = 2100;

/**
 * Returns `value` only if it is a real YYYY-MM-DD date within the supported year range
 * (same range as goal years), else null. Used to guard board date navigation.
 */
export function parseJumpDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < JUMP_MIN_YEAR || year > JUMP_MAX_YEAR) return null;
  return shiftDate(value, 0) === value ? value : null;
}

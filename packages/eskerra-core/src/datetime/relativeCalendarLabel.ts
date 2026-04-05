const MS_PER_DAY = 86_400_000;

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {weekday: 'long'});

export function startOfLocalDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Calendar days from `targetMs` start-of-day to `referenceMs` start-of-day.
 * Positive when target is before reference (target is in the past).
 */
export function calendarDaysFromTargetToReference(
  targetMs: number,
  referenceMs: number,
): number {
  const targetStart = startOfLocalDayMs(targetMs);
  const referenceStart = startOfLocalDayMs(referenceMs);
  return Math.round((referenceStart - targetStart) / MS_PER_DAY);
}

function formatIsoDateLocal(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekdayLongLocal(ms: number): string {
  return weekdayFormatter.format(new Date(ms));
}

/**
 * Relative label for a wall-clock instant (`lastModified` ms).
 * `null` shows an em dash (unknown time).
 */
export function formatRelativeCalendarLabel(
  targetMs: number | null,
  nowMs: number = Date.now(),
): string {
  if (targetMs === null) {
    return '\u2014';
  }
  const diff = calendarDaysFromTargetToReference(targetMs, nowMs);
  if (diff < 0) {
    return formatIsoDateLocal(targetMs);
  }
  if (diff === 0) {
    return 'Today';
  }
  if (diff === 1) {
    return 'Yesterday';
  }
  if (diff >= 2 && diff <= 6) {
    return weekdayLongLocal(targetMs);
  }
  return formatIsoDateLocal(targetMs);
}

/**
 * Relative label for a podcast episode date (`YYYY-MM-DD` in local calendar).
 * Invalid strings are returned unchanged.
 */
export function formatRelativeCalendarLabelFromIsoDate(
  isoDate: string,
  nowMs: number = Date.now(),
): string {
  const match = ISO_DATE_ONLY.exec(isoDate.trim());
  if (!match) {
    return isoDate;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetMs = new Date(year, monthIndex, day).getTime();
  const diff = calendarDaysFromTargetToReference(targetMs, nowMs);
  if (diff < 0) {
    return isoDate;
  }
  if (diff === 0) {
    return 'Today';
  }
  if (diff === 1) {
    return 'Yesterday';
  }
  if (diff >= 2 && diff <= 6) {
    return weekdayLongLocal(targetMs);
  }
  return isoDate;
}

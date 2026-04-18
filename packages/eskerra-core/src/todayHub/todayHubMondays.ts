import {type TodayHubStartDay, todayHubStartJsDay} from './parseTodayHubFrontmatter';

/**
 * Local-calendar first day of the week containing `reference`, using
 * JavaScript weekday numbers (Sunday = 0 … Saturday = 6).
 */
export function startOfLocalWeek(reference: Date, startDayJs: number): Date {
  const x = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const day = x.getDay();
  const diff = -((day - startDayJs + 7) % 7);
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Local-calendar Monday start of the ISO-style week (Monday = first day).
 */
export function startOfLocalWeekMonday(reference: Date): Date {
  return startOfLocalWeek(reference, 1);
}

/**
 * Adds calendar days in the local timezone (same construction as {@link enumerateTodayHubWeekStarts}),
 * avoiding UTC `setDate` surprises around DST.
 */
export function addLocalCalendarDays(date: Date, deltaDays: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + deltaDays);
}

/**
 * 53 consecutive week-start dates: previous week's anchor, then +7 days each step (local date).
 * Row files use `YYYY-MM-DD` of each anchor day.
 */
export function enumerateTodayHubWeekStarts(now: Date, start: TodayHubStartDay): Date[] {
  const js = todayHubStartJsDay(start);
  const thisWeekStart = startOfLocalWeek(now, js);
  const anchorDay = new Date(
    thisWeekStart.getFullYear(),
    thisWeekStart.getMonth(),
    thisWeekStart.getDate() - 7,
  );
  const out: Date[] = [];
  for (let k = 0; k < 53; k++) {
    out.push(addLocalCalendarDays(anchorDay, k * 7));
  }
  return out;
}

/** Same as `enumerateTodayHubWeekStarts(now, 'monday')`. */
export function enumerateTodayHubMondays(now: Date): Date[] {
  return enumerateTodayHubWeekStarts(now, 'monday');
}

/** Inclusive last calendar day of the week that begins on `weekStart` (local date; seven-day span). */
export function todayHubWeekEndInclusive(weekStart: Date): Date {
  return new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6,
  );
}

/** Progress of `now` within the 7-day window starting at `weekStart` (local calendar dates). */
export type TodayHubWeekProgress =
  | {kind: 'past'}
  | {kind: 'current'; dayIndex: number}
  | {kind: 'future'};

/**
 * Compares local calendar dates only. `dayIndex` for `current` is 0..6 where 0 is `weekStart`'s day.
 * Uses `Math.round(ms / dayMs)` so spans that are 23h or 25h between local midnights (DST) still count as one day.
 */
export function todayHubWeekProgress(weekStart: Date, now: Date): TodayHubWeekProgress {
  const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - start.getTime()) / dayMs);
  if (diffDays < 0) {
    return {kind: 'future'};
  }
  if (diffDays > 6) {
    return {kind: 'past'};
  }
  return {kind: 'current', dayIndex: diffDays};
}

/** `YYYY-MM-DD` for the row filename stem (local calendar); identifies the week's first day. */
export function formatTodayHubMondayStem(weekStart: Date): string {
  const y = weekStart.getFullYear();
  const mo = String(weekStart.getMonth() + 1).padStart(2, '0');
  const da = String(weekStart.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function todayHubRowUri(hubDirectoryUri: string, weekStart: Date): string {
  const base = hubDirectoryUri.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${base}/${formatTodayHubMondayStem(weekStart)}.md`;
}

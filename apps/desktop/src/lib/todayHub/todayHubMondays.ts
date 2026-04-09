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
    out.push(
      new Date(anchorDay.getFullYear(), anchorDay.getMonth(), anchorDay.getDate() + k * 7),
    );
  }
  return out;
}

/** Same as `enumerateTodayHubWeekStarts(now, 'monday')`. */
export function enumerateTodayHubMondays(now: Date): Date[] {
  return enumerateTodayHubWeekStarts(now, 'monday');
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

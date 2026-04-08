/**
 * Local-calendar Monday start of the ISO-style week (Monday = first day).
 */
export function startOfLocalWeekMonday(reference: Date): Date {
  const x = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const day = x.getDay();
  const diffFromMonday = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diffFromMonday);
  return x;
}

/**
 * 53 consecutive Mondays: previous week's Monday, then +7 days each step (local date).
 */
export function enumerateTodayHubMondays(now: Date): Date[] {
  const thisMonday = startOfLocalWeekMonday(now);
  const anchorDay = new Date(
    thisMonday.getFullYear(),
    thisMonday.getMonth(),
    thisMonday.getDate() - 7,
  );
  const out: Date[] = [];
  for (let k = 0; k < 53; k++) {
    out.push(
      new Date(anchorDay.getFullYear(), anchorDay.getMonth(), anchorDay.getDate() + k * 7),
    );
  }
  return out;
}

/** `YYYY-MM-DD` for the row filename stem (local calendar). */
export function formatTodayHubMondayStem(monday: Date): string {
  const y = monday.getFullYear();
  const mo = String(monday.getMonth() + 1).padStart(2, '0');
  const da = String(monday.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function todayHubRowUri(hubDirectoryUri: string, monday: Date): string {
  const base = hubDirectoryUri.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${base}/${formatTodayHubMondayStem(monday)}.md`;
}

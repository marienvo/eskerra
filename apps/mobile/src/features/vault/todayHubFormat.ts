import {todayHubWeekEndInclusive} from '@eskerra/core';

export function formatTodayHubWeekDateLong(d: Date): string {
  try {
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(d.getTime());
  }
}

export function formatTodayHubWeekRangeShort(weekStart: Date): string {
  const end = todayHubWeekEndInclusive(weekStart);
  try {
    const startPart = weekStart.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    const endPart = end.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
    return `${startPart} – ${endPart}`;
  } catch {
    return '';
  }
}

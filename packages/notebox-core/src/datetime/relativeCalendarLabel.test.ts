import {describe, expect, test} from 'vitest';

import {
  calendarDaysFromTargetToReference,
  formatRelativeCalendarLabel,
  formatRelativeCalendarLabelFromIsoDate,
  startOfLocalDayMs,
} from './relativeCalendarLabel';

/** Wednesday, Jan 22, 2020 12:00 local */
const now = new Date(2020, 0, 22, 12, 0, 0).getTime();

describe('startOfLocalDayMs', () => {
  test('normalizes to local midnight', () => {
    const late = new Date(2020, 0, 22, 23, 59, 59).getTime();
    expect(startOfLocalDayMs(late)).toBe(new Date(2020, 0, 22, 0, 0, 0).getTime());
  });
});

describe('calendarDaysFromTargetToReference', () => {
  test('is zero on the same local calendar day', () => {
    const morning = new Date(2020, 0, 22, 3, 0, 0).getTime();
    expect(calendarDaysFromTargetToReference(morning, now)).toBe(0);
  });

  test('is one for the previous calendar day', () => {
    const yesterday = new Date(2020, 0, 21, 8, 0, 0).getTime();
    expect(calendarDaysFromTargetToReference(yesterday, now)).toBe(1);
  });
});

describe('formatRelativeCalendarLabel', () => {
  test('returns em dash when lastModified is null', () => {
    expect(formatRelativeCalendarLabel(null, now)).toBe('\u2014');
  });

  test('returns Today for the same local day', () => {
    const sameDay = new Date(2020, 0, 22, 6, 0, 0).getTime();
    expect(formatRelativeCalendarLabel(sameDay, now)).toBe('Today');
  });

  test('returns Yesterday for the previous local day', () => {
    const prev = new Date(2020, 0, 21, 18, 0, 0).getTime();
    expect(formatRelativeCalendarLabel(prev, now)).toBe('Yesterday');
  });

  test('returns weekday for 2–6 calendar days ago', () => {
    const monday = new Date(2020, 0, 20, 12, 0, 0).getTime();
    expect(formatRelativeCalendarLabel(monday, now)).toBe('Monday');
  });

  test('returns ISO date at 7+ calendar days ago', () => {
    const weekAgo = new Date(2020, 0, 15, 12, 0, 0).getTime();
    expect(formatRelativeCalendarLabel(weekAgo, now)).toBe('2020-01-15');
  });

  test('returns ISO date for a future modification time', () => {
    const future = new Date(2020, 0, 25, 12, 0, 0).getTime();
    expect(formatRelativeCalendarLabel(future, now)).toBe('2020-01-25');
  });
});

describe('formatRelativeCalendarLabelFromIsoDate', () => {
  test('returns Today for the same local calendar date', () => {
    expect(formatRelativeCalendarLabelFromIsoDate('2020-01-22', now)).toBe('Today');
  });

  test('returns Yesterday for the previous date', () => {
    expect(formatRelativeCalendarLabelFromIsoDate('2020-01-21', now)).toBe('Yesterday');
  });

  test('returns weekday name in the 2–6 day window', () => {
    expect(formatRelativeCalendarLabelFromIsoDate('2020-01-20', now)).toBe('Monday');
  });

  test('returns raw ISO at 7+ days', () => {
    expect(formatRelativeCalendarLabelFromIsoDate('2020-01-15', now)).toBe('2020-01-15');
  });

  test('returns raw ISO for a future episode date', () => {
    expect(formatRelativeCalendarLabelFromIsoDate('2020-01-25', now)).toBe('2020-01-25');
  });

  test('returns original string when not YYYY-MM-DD', () => {
    expect(formatRelativeCalendarLabelFromIsoDate('bad-date', now)).toBe('bad-date');
  });
});

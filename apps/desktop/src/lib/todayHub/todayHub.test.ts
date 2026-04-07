import {describe, expect, it} from 'vitest';

import {
  enumerateTodayHubMondays,
  formatTodayHubMondayStem,
  mergeTodayRowColumns,
  parseTodayHubFrontmatter,
  splitTodayRowIntoColumns,
  startOfLocalWeekMonday,
  todayHubColumnCount,
  todayHubRowSectionsAllBlank,
  todayHubRowUri,
} from './index';

describe('startOfLocalWeekMonday', () => {
  it('returns Monday for a Tuesday', () => {
    const tue = new Date(2026, 3, 7);
    const mon = startOfLocalWeekMonday(tue);
    expect(mon.getFullYear()).toBe(2026);
    expect(mon.getMonth()).toBe(3);
    expect(mon.getDate()).toBe(6);
  });

  it('returns same calendar Monday when input is Monday', () => {
    const mon = new Date(2026, 3, 6);
    const out = startOfLocalWeekMonday(mon);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(3);
    expect(out.getDate()).toBe(6);
  });

  it('maps Sunday to previous Monday', () => {
    const sun = new Date(2026, 3, 5);
    const out = startOfLocalWeekMonday(sun);
    expect(out.getDate()).toBe(30);
    expect(out.getMonth()).toBe(2);
  });
});

describe('enumerateTodayHubMondays', () => {
  it('returns 53 Mondays starting at previous week', () => {
    const now = new Date(2026, 3, 7);
    const mondays = enumerateTodayHubMondays(now);
    expect(mondays).toHaveLength(53);
    expect(formatTodayHubMondayStem(mondays[0])).toBe('2026-03-30');
    expect(formatTodayHubMondayStem(mondays[1])).toBe('2026-04-06');
    expect(formatTodayHubMondayStem(mondays[52])).toBe('2027-03-29');
  });
});

describe('todayHubRowUri', () => {
  it('builds path with ISO date stem', () => {
    const mon = new Date(2026, 3, 6);
    expect(todayHubRowUri('/vault/Daily', mon)).toBe('/vault/Daily/2026-04-06.md');
    expect(todayHubRowUri('/vault/Daily/', mon)).toBe('/vault/Daily/2026-04-06.md');
  });
});

describe('parseTodayHubFrontmatter', () => {
  it('defaults when no frontmatter', () => {
    const s = parseTodayHubFrontmatter('# Hello\n\nbody');
    expect(s.perpetualType).toBe('weekly');
    expect(s.columns).toEqual([]);
    expect(s.start).toBe('monday');
  });

  it('reads perpetualType, columns, start', () => {
    const md = `---
perpetualType: weekly
columns:
  - Next actions
start: monday
---
# Today hub
`;
    const s = parseTodayHubFrontmatter(md);
    expect(s.perpetualType).toBe('weekly');
    expect(s.columns).toEqual(['Next actions']);
    expect(s.start).toBe('monday');
    expect(todayHubColumnCount(s)).toBe(2);
  });

  it('reads multiple columns', () => {
    const md = `---
columns:
  - A
  - B
---
`;
    expect(parseTodayHubFrontmatter(md).columns).toEqual(['A', 'B']);
    expect(todayHubColumnCount(parseTodayHubFrontmatter(md))).toBe(3);
  });
});

describe('splitTodayRowIntoColumns / mergeTodayRowColumns', () => {
  it('single column is identity', () => {
    const raw = '# Hi\n\nfoo';
    expect(splitTodayRowIntoColumns(raw, 1)).toEqual([raw.replace(/\r\n/g, '\n')]);
  });

  it('splits on delimiter and merges back', () => {
    const merged = mergeTodayRowColumns(['# 2026-04-06\n\ndefault col', 'actions\n\nmore']);
    const parts = splitTodayRowIntoColumns(merged, 2);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('# 2026-04-06\n\ndefault col');
    expect(parts[1]).toBe('actions\n\nmore');
    expect(roundTrip(parts, 2)).toBe(merged);
  });

  it('pads when multi-column but no delimiter', () => {
    const parts = splitTodayRowIntoColumns('only default', 3);
    expect(parts).toEqual(['only default', '', '']);
  });

  it('merges extra chunks into last column', () => {
    const text = 'a\n\n::today-section::\n\nb\n\n::today-section::\n\nc\n\n::today-section::\n\nd';
    const parts = splitTodayRowIntoColumns(text, 2);
    expect(parts[0]).toBe('a');
    expect(parts[1]).toBe('b\n\n::today-section::\n\nc\n\n::today-section::\n\nd');
  });

  it('todayHubRowSectionsAllBlank', () => {
    expect(todayHubRowSectionsAllBlank(['', '  \n'])).toBe(true);
    expect(todayHubRowSectionsAllBlank(['x'])).toBe(false);
  });
});

function roundTrip(sections: string[], count: number): string {
  const merged = mergeTodayRowColumns(sections);
  const again = splitTodayRowIntoColumns(merged, count);
  return mergeTodayRowColumns(again);
}

describe('roundTrip', () => {
  it('stable for two columns', () => {
    const sections = ['# T\n\none', 'two\n'];
    expect(roundTrip(sections, 2)).toBe(mergeTodayRowColumns(sections));
  });
});

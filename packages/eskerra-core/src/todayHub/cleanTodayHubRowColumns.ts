import {mergeTodayRowColumns} from './splitMergeTodayRowColumns';

/**
 * Runs `cleanColumn` on each section whose text is non-empty after trim, then merges hub columns.
 * Empty columns are left unchanged so `::today-section::` delimiters stay structural.
 */
export function mergeTodayHubRowAfterCleaningNonEmptyColumns(
  sections: readonly string[],
  cleanColumn: (text: string) => string,
): {merged: string; changed: boolean} {
  let changed = false;
  const out = sections.map(cell => {
    const s = cell ?? '';
    if (s.trim() === '') {
      return s;
    }
    const next = cleanColumn(s);
    if (next !== s) {
      changed = true;
    }
    return next;
  });
  return {merged: mergeTodayRowColumns(out), changed};
}

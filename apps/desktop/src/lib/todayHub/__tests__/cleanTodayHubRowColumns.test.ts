import {describe, expect, it} from 'vitest';

import {TODAY_HUB_SECTION_DELIMITER} from '../todayHubSectionDelimiter';
import {mergeTodayHubRowAfterCleaningNonEmptyColumns} from '../cleanTodayHubRowColumns';

describe('mergeTodayHubRowAfterCleaningNonEmptyColumns', () => {
  it('leaves empty columns untouched and preserves delimiter structure', () => {
    const sections = ['alpha', '', 'beta'];
    const {merged, changed} = mergeTodayHubRowAfterCleaningNonEmptyColumns(
      sections,
      s => (s === 'alpha' ? 'ALPHA' : s === 'beta' ? 'BETA' : s),
    );
    expect(changed).toBe(true);
    expect(merged).toBe(`ALPHA${TODAY_HUB_SECTION_DELIMITER}${TODAY_HUB_SECTION_DELIMITER}BETA`);
  });

  it('returns changed false when cleanColumn is identity', () => {
    const sections = ['x', 'y'];
    const {merged, changed} = mergeTodayHubRowAfterCleaningNonEmptyColumns(
      sections,
      s => s,
    );
    expect(changed).toBe(false);
    expect(merged).toBe(`x${TODAY_HUB_SECTION_DELIMITER}y`);
  });

  it('skips cleaning whitespace-only columns', () => {
    const sections = ['\t', 'ok'];
    const {merged, changed} = mergeTodayHubRowAfterCleaningNonEmptyColumns(
      sections,
      s => `${s}!`,
    );
    expect(changed).toBe(true);
    expect(merged).toBe(`\t${TODAY_HUB_SECTION_DELIMITER}ok!`);
  });
});

import {describe, expect, it} from 'vitest';

import {
  buildCellStaticSegments,
  mergeStyledIntervals,
} from './eskerraTableCellStaticSegments';

const alwaysFalse = (): boolean => false;
const alwaysTrue = (): boolean => true;

describe('mergeStyledIntervals', () => {
  it('covers full length with empty class when no intervals', () => {
    expect(mergeStyledIntervals(5, [])).toEqual([{from: 0, to: 5, className: ''}]);
  });

  it('merges adjacent runs with the same className', () => {
    expect(
      mergeStyledIntervals(4, [
        {from: 0, to: 2, priority: 0, classes: 'a'},
        {from: 2, to: 4, priority: 0, classes: 'a'},
      ]),
    ).toEqual([{from: 0, to: 4, className: 'a'}]);
  });

  it('higher priority overlays lower for overlapping region', () => {
    const segs = mergeStyledIntervals(10, [
      {from: 0, to: 10, priority: 0, classes: 'cm-md-emphasis'},
      {from: 2, to: 8, priority: 2, classes: 'cm-wiki-link cm-wiki-link--unresolved'},
    ]);
    expect(segs.find(s => s.from === 2 && s.to === 8)?.className).toContain('cm-wiki-link');
    expect(segs.find(s => s.from === 0 && s.to === 2)?.className).toContain('cm-md-emphasis');
  });
});

describe('buildCellStaticSegments', () => {
  it('styles strong emphasis', () => {
    const {segments: segs} = buildCellStaticSegments('**b**', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    const joined = segs.map(s => cellTextSlice('**b**', s)).join('');
    expect(joined).toBe('**b**');
    expect(segs.some(s => s.className.includes('cm-md-strong'))).toBe(true);
  });

  it('styles italic emphasis', () => {
    const {segments: segs} = buildCellStaticSegments('*i*', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-md-emphasis'))).toBe(true);
  });

  it('styles inline code', () => {
    const {segments: segs} = buildCellStaticSegments('`x`', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-md-code'))).toBe(true);
  });

  it('styles strikethrough', () => {
    const {segments: segs} = buildCellStaticSegments('~~s~~', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-md-strikethrough'))).toBe(true);
  });

  it('styles percent muted', () => {
    const {segments: segs} = buildCellStaticSegments('%%m%%', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-md-percent-muted'))).toBe(true);
  });

  it('styles equal highlight', () => {
    const {segments: segs} = buildCellStaticSegments('==h==', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-md-equal-highlight'))).toBe(true);
  });

  it('styles wiki inner and brackets', () => {
    const {segments: segs} = buildCellStaticSegments('[[page]]', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-md-wiki-bracket'))).toBe(true);
    expect(segs.some(s => s.className.includes('cm-wiki-link--unresolved'))).toBe(true);
  });

  it('marks resolved wiki when predicate is true', () => {
    const {segments: segs} = buildCellStaticSegments('[[here]]', {
      wikiTargetIsResolved: inner => inner === 'here',
      relativeMarkdownLinkHrefIsResolved: alwaysFalse,
    });
    expect(segs.some(s => s.className.includes('cm-wiki-link--resolved'))).toBe(true);
  });

  it('styles activatable relative markdown link label and href', () => {
    const {segments: segs} = buildCellStaticSegments('[n](other.md)', {
      wikiTargetIsResolved: alwaysFalse,
      relativeMarkdownLinkHrefIsResolved: alwaysTrue,
    });
    expect(
      segs.some(
        s =>
          s.className.includes('cm-md-rel-link--resolved')
          && s.className.includes('cm-md-rel-link-href'),
      ),
    ).toBe(true);
    expect(segs.some(s => s.className.includes('cm-md-rel-link--resolved'))).toBe(true);
  });
});

function cellTextSlice(text: string, seg: {from: number; to: number}): string {
  return text.slice(seg.from, seg.to);
}

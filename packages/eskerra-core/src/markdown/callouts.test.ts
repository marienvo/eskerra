import {describe, expect, test} from 'vitest';

import {matchCalloutHeader, resolveCallout} from './callouts';

describe('resolveCallout', () => {
  test('resolves canonical types case-insensitively', () => {
    expect(resolveCallout('TIP').type).toBe('tip');
    expect(resolveCallout('Tip').label).toBe('Tip');
    expect(resolveCallout('WARNING').type).toBe('warning');
  });

  test('resolves aliases to canonical keys', () => {
    expect(resolveCallout('hint').type).toBe('tip');
    expect(resolveCallout('tldr').type).toBe('abstract');
    expect(resolveCallout('cite').type).toBe('quote');
    expect(resolveCallout('error').type).toBe('danger');
  });

  test('unknown types fall back to note', () => {
    const r = resolveCallout('unknown-xyz');
    expect(r.type).toBe('note');
    expect(r.icon).toBe('edit');
  });
});

describe('matchCalloutHeader', () => {
  test('parses simple callout with custom title', () => {
    const m = matchCalloutHeader('> [!tip] A tip');
    expect(m).not.toBeNull();
    expect(m!.type).toBe('tip');
    expect(m!.rawType).toBe('tip');
    expect(m!.title).toBe('A tip');
    expect(m!.startCol).toBe(2);
    expect(m!.endCol).toBe(2 + '[!tip]'.length);
  });

  test('parses uppercase type', () => {
    const m = matchCalloutHeader('> [!INFO]');
    expect(m!.type).toBe('info');
    expect(m!.title).toBe('');
  });

  test('includes fold marker in column span', () => {
    const m = matchCalloutHeader('> [!warning]+ Some warning');
    expect(m!.type).toBe('warning');
    expect(m!.title).toBe('Some warning');
    expect(lineSlice('> [!warning]+ Some warning', m!.startCol, m!.endCol)).toBe('[!warning]+');
  });

  test('resolves alias in bracket', () => {
    const m = matchCalloutHeader('> [!hint] body');
    expect(m!.type).toBe('tip');
    expect(m!.title).toBe('body');
  });

  test('rejects nested quote markers on same line', () => {
    expect(matchCalloutHeader('> > [!tip] nested')).toBeNull();
    expect(matchCalloutHeader('>> [!tip] x')).toBeNull();
  });

  test('allows leading whitespace before first quote', () => {
    const m = matchCalloutHeader('  > [!note] ok');
    expect(m).not.toBeNull();
    expect(m!.type).toBe('note');
  });

  test('unknown bracket type still matches header and resolves to note', () => {
    const m = matchCalloutHeader('> [!unknown-xyz] Title');
    expect(m).not.toBeNull();
    expect(m!.type).toBe('note');
    expect(m!.title).toBe('Title');
  });
});

function lineSlice(line: string, start: number, end: number): string {
  return line.slice(start, end);
}

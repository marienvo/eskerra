import {parseTodayHubFrontmatter} from '@eskerra/core';
import {describe, expect, it} from 'vitest';

import {inboxEditorSliceToFullMarkdown} from '../../lib/inboxYamlFrontmatterEditor';

describe('serializeFrontmatterInner merge path — body stability', () => {
  const uri = '/vault/N.md';

  it('changing only YAML inner preserves the body slice string', () => {
    const body = '# Hi\n\nPara.';
    const fullBefore = inboxEditorSliceToFullMarkdown(body, uri, false, 'a: one', '');
    expect(fullBefore.startsWith('---\na: one\n---')).toBe(true);
    expect(fullBefore.endsWith(body)).toBe(true);

    const fullAfter = inboxEditorSliceToFullMarkdown(body, uri, false, 'a: two', '');
    expect(fullAfter.endsWith(body)).toBe(fullBefore.endsWith(body));
    expect(fullAfter).toContain('a: two');
  });

  it('drops the fenced block when YAML inner resolves to empty mapping', () => {
    expect(inboxEditorSliceToFullMarkdown('Only', uri, false, null, '')).toBe(
      'Only',
    );
  });

  it('Today hub keys parse after yaml-inner merge', () => {
    const body = '# Today';
    const inner =
      'columns:\n  - A\n  - B\nstart: saturday\nperpetualType: weekly';
    const full = inboxEditorSliceToFullMarkdown(
      body,
      '/vault/Today.md',
      false,
      inner,
      '',
    );
    const hub = parseTodayHubFrontmatter(full);
    expect(hub.columns).toEqual(['A', 'B']);
    expect(hub.start).toBe('saturday');
    expect(hub.perpetualType).toBe('weekly');
  });
});

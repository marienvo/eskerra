import {describe, expect, it} from 'vitest';

import {clickAddsSelectionRangePredicate} from './multiCaretClick';

describe('clickAddsSelectionRangePredicate', () => {
  it('treats Alt as add-range on non-mac', () => {
    expect(
      clickAddsSelectionRangePredicate(
        {altKey: true, ctrlKey: false, metaKey: false},
        false,
      ),
    ).toBe(true);
  });

  it('treats Ctrl as add-range when not Mac', () => {
    expect(
      clickAddsSelectionRangePredicate(
        {altKey: false, ctrlKey: true, metaKey: false},
        false,
      ),
    ).toBe(true);
  });

  it('treats Meta as add-range on Mac', () => {
    expect(
      clickAddsSelectionRangePredicate(
        {altKey: false, ctrlKey: false, metaKey: true},
        true,
      ),
    ).toBe(true);
  });

  it('does not treat Ctrl alone as add-range on Mac', () => {
    expect(
      clickAddsSelectionRangePredicate(
        {altKey: false, ctrlKey: true, metaKey: false},
        true,
      ),
    ).toBe(false);
  });

  it('treats Alt as add-range on Mac', () => {
    expect(
      clickAddsSelectionRangePredicate(
        {altKey: true, ctrlKey: false, metaKey: false},
        true,
      ),
    ).toBe(true);
  });
});

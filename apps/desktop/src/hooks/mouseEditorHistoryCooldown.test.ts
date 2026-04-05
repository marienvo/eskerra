import {describe, expect, it} from 'vitest';

import {
  isWithinMouseHistoryCooldown,
  MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS,
} from './mouseEditorHistoryCooldown';

describe('isWithinMouseHistoryCooldown', () => {
  it('returns false when no navigation has occurred yet', () => {
    expect(isWithinMouseHistoryCooldown(0, 10_000, 400)).toBe(false);
  });

  it('returns true when within the cooldown window after lastNavMs', () => {
    expect(isWithinMouseHistoryCooldown(1000, 1200, 400)).toBe(true);
  });

  it('returns false at exactly cooldownMs elapsed (exclusive upper bound)', () => {
    expect(isWithinMouseHistoryCooldown(1000, 1400, 400)).toBe(false);
  });

  it('returns false after cooldown window', () => {
    expect(isWithinMouseHistoryCooldown(1000, 2000, 400)).toBe(false);
  });
});

describe('MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS', () => {
  it('is a positive duration', () => {
    expect(MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS).toBeGreaterThan(0);
  });
});

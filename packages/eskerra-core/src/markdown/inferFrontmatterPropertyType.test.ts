import {describe, expect, it} from 'vitest';

import {
  inferPropertyTypeFromVaultSamples,
  detectValueShapeType,
} from './inferFrontmatterPropertyType';

describe('inferPropertyTypeFromVaultSamples', () => {
  it('uses special keys tags and aliases', () => {
    expect(inferPropertyTypeFromVaultSamples({key: 'tags', samples: []})).toBe(
      'tags',
    );
    expect(
      inferPropertyTypeFromVaultSamples({key: 'aliases', samples: []}),
    ).toBe('list');
  });

  it('requires 3 samples for statistical inference', () => {
    expect(
      inferPropertyTypeFromVaultSamples({
        key: 'k',
        samples: ['2024-01-01', '2024-01-02'],
      }),
    ).toBe('text');
  });

  it('infers date with 70% agreement', () => {
    const samples = [
      '2024-01-01',
      '2024-01-02',
      '2024-01-03',
      '2024-01-04',
      'oops',
    ];
    const t = inferPropertyTypeFromVaultSamples({key: 'k', samples});
    expect(t).toBe('date');
  });

  it('falls back to text without strong majority', () => {
    const samples = [
      '2024-01-01',
      '2024-01-02',
      'hello',
      'other',
    ];
    expect(inferPropertyTypeFromVaultSamples({key: 'k', samples})).toBe('text');
  });
});

describe('detectValueShapeType', () => {
  it('distinguishes date, datetime, and timestamp strings', () => {
    expect(detectValueShapeType('2026-08-03')).toBe('date');
    expect(detectValueShapeType('2026-04-19T14:30')).toBe('datetime');
    expect(detectValueShapeType('2026-04-19T12:30:00Z')).toBe('timestamp');
  });
});

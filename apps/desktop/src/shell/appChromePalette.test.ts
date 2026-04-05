import {describe, expect, it} from 'vitest';

import {
  APP_CHROME_PALETTE,
  CHROME_PALETTE_MAX,
  layoutChromeBlobs,
  normalizeChromePalette,
} from './appChromePalette';

describe('normalizeChromePalette', () => {
  it('trims and caps at CHROME_PALETTE_MAX', () => {
    const many = Array.from({length: 40}, (_, i) => APP_CHROME_PALETTE[i % APP_CHROME_PALETTE.length]);
    const out = normalizeChromePalette(many);
    expect(out).toHaveLength(CHROME_PALETTE_MAX);
  });

  it('rejects invalid hex', () => {
    expect(() => normalizeChromePalette(['#12'])).toThrow(/Invalid chrome color/);
    expect(() => normalizeChromePalette(['blue'])).toThrow(/Invalid chrome color/);
  });
});

describe('layoutChromeBlobs', () => {
  it('throws on empty palette', () => {
    expect(() => layoutChromeBlobs([])).toThrow(/at least one color/);
  });

  it('returns no ellipses for a single color', () => {
    expect(layoutChromeBlobs(['#031226'])).toEqual([]);
  });

  it('returns one blob per color for 2..30 colors', () => {
    for (const n of [2, 5, 30]) {
      const colors = APP_CHROME_PALETTE.slice(0, Math.min(n, APP_CHROME_PALETTE.length));
      const pad = Array.from({length: Math.max(0, n - colors.length)}, (_, i) => {
        const v = ((0x202020 + i * 0x050505) & 0xffffff).toString(16).padStart(6, '0');
        return `#${v}`;
      });
      const list = [...colors, ...pad].slice(0, n);
      const blobs = layoutChromeBlobs(list);
      expect(blobs).toHaveLength(n);
      for (const b of blobs) {
        expect(Number.isFinite(b.cx)).toBe(true);
        expect(Number.isFinite(b.cy)).toBe(true);
        expect(Number.isFinite(b.rx)).toBe(true);
        expect(Number.isFinite(b.ry)).toBe(true);
        expect(b.rx).toBeGreaterThan(0);
        expect(b.ry).toBeGreaterThan(0);
        expect(HEX6.test(b.fill)).toBe(true);
      }
    }
  });
});

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

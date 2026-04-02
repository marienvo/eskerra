import {describe, expect, it} from 'vitest';

import {
  computeStartupBarDisplayGain,
  computeStartupSpectrumSample,
  logoSpatialEnvelope,
  MIDDLE_STARTUP_BARS_FULL,
  smoothSpectrumLevelsInPlace,
} from './startupSplashSpectrum';

const BAR_COUNT = 30;

function levelsAt(tSec: number, staticOnly = false): number[] {
  return Array.from({length: BAR_COUNT}, (_, i) =>
    computeStartupSpectrumSample(tSec, i, BAR_COUNT, staticOnly),
  );
}

describe('startupSplashSpectrum', () => {
  it('keeps visible micro-motion in quiet periods without flattening to zero', () => {
    const maxima: number[] = [];
    for (let t = 0; t < 18; t += 0.025) {
      const lv = levelsAt(t);
      maxima.push(Math.max(...lv));
    }
    expect(Math.min(...maxima)).toBeGreaterThan(0.005);
    expect(Math.max(...maxima) - Math.min(...maxima)).toBeGreaterThan(0.15);
  });

  it('concentrates energy in a subset of bins when active (formant-like)', () => {
    let bestSpread = 0;
    for (let t = 0; t < 12; t += 0.02) {
      const lv = levelsAt(t);
      const mx = Math.max(...lv);
      if (mx < 0.2) {
        continue;
      }
      const aboveHalf = lv.filter(x => x > mx * 0.5).length;
      const spread = BAR_COUNT - aboveHalf;
      bestSpread = Math.max(bestSpread, spread);
    }
    expect(bestSpread).toBeGreaterThan(7);
  });

  it('logoSpatialEnvelope peaks near 60% across the white segment and tapers cyan', () => {
    const n = 20;
    const split = Math.ceil(n / 2);
    let maxI = 0;
    let maxW = -1;
    for (let i = 0; i < split; i++) {
      const w = logoSpatialEnvelope(i, n);
      if (w > maxW) {
        maxW = w;
        maxI = i;
      }
    }
    const expected = Math.round(0.6 * (split - 1));
    expect(Math.abs(maxI - expected)).toBeLessThanOrEqual(1);

    const firstCyan = logoSpatialEnvelope(split, n);
    const lastCyan = logoSpatialEnvelope(n - 1, n);
    expect(firstCyan).toBeGreaterThan(lastCyan);
  });

  it('when active, white-bin argmax clusters near the logo peak (time aggregate)', () => {
    const split = Math.ceil(BAR_COUNT / 2);
    const expectedPeak = Math.round(0.6 * (split - 1));
    const aroundPeak = new Set(
      [expectedPeak - 1, expectedPeak, expectedPeak + 1].filter(i => i >= 0 && i < split),
    );

    let hitsNearPeak = 0;
    let activeFrames = 0;

    for (let t = 0; t < 18; t += 0.02) {
      const lv = levelsAt(t);
      if (Math.max(...lv) < 0.12) {
        continue;
      }
      activeFrames++;
      let bestI = 0;
      let bestV = -1;
      for (let i = 0; i < split; i++) {
        const v = lv[i] ?? 0;
        if (v > bestV) {
          bestV = v;
          bestI = i;
        }
      }
      if (aroundPeak.has(bestI)) {
        hitsNearPeak++;
      }
    }

    expect(activeFrames).toBeGreaterThan(50);
    expect(hitsNearPeak / activeFrames).toBeGreaterThan(0.38);
  });

  it('when active, cyan segment is higher on the left than the right on average', () => {
    const split = Math.ceil(BAR_COUNT / 2);
    const cyan = BAR_COUNT - split;
    const third = Math.max(1, Math.floor(cyan / 3));

    let sumEdge = 0;
    let activeFrames = 0;

    for (let t = 0; t < 18; t += 0.02) {
      const lv = levelsAt(t);
      if (Math.max(...lv) < 0.12) {
        continue;
      }
      activeFrames++;
      const slice = lv.slice(split);
      let sFirst = 0;
      let sLast = 0;
      for (let k = 0; k < third; k++) {
        sFirst += slice[k] ?? 0;
        sLast += slice[slice.length - 1 - k] ?? 0;
      }
      sumEdge += sFirst / third - sLast / third;
    }

    expect(activeFrames).toBeGreaterThan(50);
    expect(sumEdge / activeFrames).toBeGreaterThan(0.006);
  });

  it('static reduced-motion path keeps stable range', () => {
    const lv = levelsAt(0, true);
    for (const v of lv) {
      expect(v).toBeGreaterThanOrEqual(0.09);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('smoothSpectrumLevelsInPlace blends neighbors', () => {
    const levels = [0, 1, 0, 1, 0];
    smoothSpectrumLevelsInPlace(levels, 0.5);
    expect(levels[0]).toBeCloseTo(0.25, 5);
    expect(levels[1]).toBeCloseTo(0.5, 5);
    expect(levels[2]).toBeCloseTo(0.5, 5);
  });

  describe('computeStartupBarDisplayGain', () => {
    const n = 10;

    it('freezes outer bars and gives full gain to the middle six', () => {
      expect(computeStartupBarDisplayGain(0, n, MIDDLE_STARTUP_BARS_FULL)).toBe(0);
      expect(computeStartupBarDisplayGain(9, n, MIDDLE_STARTUP_BARS_FULL)).toBe(0);
      for (let i = 2; i <= 7; i++) {
        expect(computeStartupBarDisplayGain(i, n, MIDDLE_STARTUP_BARS_FULL)).toBe(1);
      }
    });

    it('ramps strictly between outer and middle (transition bins)', () => {
      const g1 = computeStartupBarDisplayGain(1, n, MIDDLE_STARTUP_BARS_FULL);
      const g8 = computeStartupBarDisplayGain(8, n, MIDDLE_STARTUP_BARS_FULL);
      expect(g1).toBeGreaterThan(0);
      expect(g1).toBeLessThan(1);
      expect(g8).toBeGreaterThan(0);
      expect(g8).toBeLessThan(1);
    });

    it('ramps monotonically toward the center from each edge', () => {
      const left: number[] = [];
      for (let i = 0; i <= 2; i++) {
        left.push(computeStartupBarDisplayGain(i, n, MIDDLE_STARTUP_BARS_FULL));
      }
      for (let k = 1; k < left.length; k++) {
        expect(left[k]).toBeGreaterThanOrEqual(left[k - 1]!);
      }
      const right: number[] = [];
      for (let i = 9; i >= 7; i--) {
        right.push(computeStartupBarDisplayGain(i, n, MIDDLE_STARTUP_BARS_FULL));
      }
      for (let k = 1; k < right.length; k++) {
        expect(right[k]).toBeGreaterThanOrEqual(right[k - 1]!);
      }
    });
  });
});

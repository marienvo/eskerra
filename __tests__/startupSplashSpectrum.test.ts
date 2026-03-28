import {
  computeStartupSpectrumSample,
  smoothSpectrumLevelsInPlace,
} from '../src/core/ui/startupSplashSpectrum';

const BAR_COUNT = 30;

function levelsAt(tSec: number, staticOnly = false): number[] {
  return Array.from({length: BAR_COUNT}, (_, i) =>
    computeStartupSpectrumSample(tSec, i, BAR_COUNT, staticOnly),
  );
}

describe('startupSplashSpectrum', () => {
  it('has intervals where all bars are near silent (phrase gaps)', () => {
    const samples: number[] = [];
    for (let t = 0; t < 18; t += 0.025) {
      const lv = levelsAt(t);
      samples.push(Math.max(...lv));
    }
    const silentFrames = samples.filter(m => m < 0.005).length;
    expect(silentFrames / samples.length).toBeGreaterThan(0.28);
    expect(Math.min(...samples)).toBeLessThan(0.02);
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
    expect(bestSpread).toBeGreaterThan(8);
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
});

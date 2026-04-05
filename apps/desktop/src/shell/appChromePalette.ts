/**
 * Main-window chrome background: organic multi-color blobs blurred in SVG.
 * Tunables: blur strength in `AppChromeBackground`; spiral spread below; size tiers.
 */

/** Maximum colors supported by layout (performance / visual clarity). */
export const CHROME_PALETTE_MAX = 30;

export const APP_CHROME_PALETTE = [
  '#031226',
  '#11538C',
  '#11A0D9',
  '#41CAD9',
  '#B3F2D5',
] as const;

export type ChromeBlob = {
  fill: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function deterministicUnit(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Throws if any entry is not `#RRGGBB`; trims strings. Returns at most `CHROME_PALETTE_MAX` entries. */
export function normalizeChromePalette(colors: readonly string[]): string[] {
  const trimmed = colors.map(c => c.trim()).filter(Boolean);
  const slice = trimmed.slice(0, CHROME_PALETTE_MAX);
  for (const c of slice) {
    if (!HEX6.test(c)) {
      throw new Error(`Invalid chrome color (expected #RRGGBB): ${c}`);
    }
  }
  return slice;
}

/**
 * Deterministic blob layout in viewBox coordinates 0–100 (ellipse centers and radii).
 * For a single color, returns an empty array (caller renders a full rect instead).
 * Uses a Vogel/Fermat spiral with jitter and strongly varying ellipse sizes.
 */
export function layoutChromeBlobs(colors: readonly string[]): ChromeBlob[] {
  const list = normalizeChromePalette(colors);
  if (list.length === 0) {
    throw new Error('Chrome palette requires at least one color');
  }
  if (list.length === 1) {
    return [];
  }

  const n = list.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const blobs: ChromeBlob[] = [];

  for (let i = 0; i < n; i++) {
    const t = i + 1;
    const rNorm = Math.sqrt(t / (n + 1)) * 0.52;
    const theta = i * golden;
    const jitterR = 0.06 * (deterministicUnit(i, 1) - 0.5);
    const jitterT = 0.22 * (deterministicUnit(i, 2) - 0.5);
    const rr = Math.max(0.05, rNorm + jitterR);
    const spread = 92;
    const cx = 50 + rr * Math.cos(theta + jitterT) * spread;
    const cy = 50 + rr * Math.sin(theta + jitterT) * spread;

    const sizeRoll = deterministicUnit(i, 3);
    const anchorBoost = i === 0 ? 1.35 : 1;
    const baseScale =
      i === 0 ? 48 * anchorBoost : 14 + sizeRoll * 32 * (0.75 + deterministicUnit(i, 5) * 0.5);

    const aspect = 0.52 + deterministicUnit(i, 4) * 0.96;
    const rx = baseScale * (0.62 + aspect * 0.55);
    const ry = baseScale * (1.12 - aspect * 0.42);

    blobs.push({
      fill: list[i],
      cx,
      cy,
      rx,
      ry,
    });
  }

  return blobs;
}

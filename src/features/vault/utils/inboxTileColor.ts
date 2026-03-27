/** Weekday of last edit (local time): Sunday = 0 … Saturday = 6 */
const BASE_HEX_BY_WEEKDAY: readonly string[] = [
  '#73C6B6', // Sunday — teal
  '#5DADE2', // Monday — soft blue
  '#58D68D', // Tuesday — mint green
  '#F4D03F', // Wednesday — warm yellow
  '#EB984E', // Thursday — soft orange
  '#EC7063', // Friday — muted red
  '#AF7AC5', // Saturday — soft purple
];

export const NEUTRAL_GRAY = '#6b7280';

const MS_PER_DAY = 86_400_000;

function parseRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    throw new Error(`Expected #RRGGBB, got ${hex}`);
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function mixHex(baseHex: string, targetHex: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const [r0, g0, b0] = parseRgb(baseHex);
  const [r1, g1, b1] = parseRgb(targetHex);
  const r = Math.round(r0 * (1 - clamped) + r1 * clamped);
  const g = Math.round(g0 * (1 - clamped) + g1 * clamped);
  const b = Math.round(b0 * (1 - clamped) + b1 * clamped);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function grayMixRatioForAgeMs(ageMs: number): number {
  const ageDays = ageMs / MS_PER_DAY;
  if (ageDays < 7) {
    return 0;
  }
  if (ageDays < 14) {
    return 0.25;
  }
  if (ageDays < 21) {
    return 0.5;
  }
  if (ageDays < 28) {
    return 0.75;
  }
  return 1;
}

function weekdayBaseHex(lastModifiedMs: number): string {
  const dayIndex = new Date(lastModifiedMs).getDay();
  return BASE_HEX_BY_WEEKDAY[dayIndex];
}

export function getInboxTileBackgroundColor(
  lastModified: number | null,
  now: number = Date.now(),
): string {
  if (lastModified === null || lastModified > now) {
    return NEUTRAL_GRAY;
  }
  const ageMs = now - lastModified;
  const t = grayMixRatioForAgeMs(ageMs);
  const base = weekdayBaseHex(lastModified);
  return mixHex(base, NEUTRAL_GRAY, t);
}

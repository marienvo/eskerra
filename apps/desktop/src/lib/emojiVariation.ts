import {EMOJI_VS16_BASE_CODE_POINTS} from './emojiVariationBases.generated';

const VS16 = '\uFE0F';
const VS15 = '\uFE0E';
const ZWJ = '\u200D';

const emojiVs16Bases = new Set<string>();
for (const cp of EMOJI_VS16_BASE_CODE_POINTS) {
  emojiVs16Bases.add(String.fromCodePoint(cp));
}

function isRegionalIndicator(ch: string): boolean {
  const codePoint = ch.codePointAt(0);
  if (codePoint == null) {
    return false;
  }
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function removeZwjsBetweenRegionalIndicators(text: string): string {
  const codePoints = Array.from(text);
  let changed = false;
  const out: string[] = [];

  for (let i = 0; i < codePoints.length; i++) {
    const current = codePoints[i]!;
    if (current === ZWJ) {
      const prev = out.length > 0 ? out[out.length - 1]! : null;
      const next = codePoints[i + 1] ?? null;
      if (prev && next && isRegionalIndicator(prev) && isRegionalIndicator(next)) {
        changed = true;
        continue;
      }
    }
    out.push(current);
  }

  if (!changed) {
    return text;
  }
  return out.join('');
}

export function ensureEmojiPresentationVs16(text: string): string {
  const codePoints = Array.from(text);
  let changed = false;
  const out: string[] = [];

  for (let i = 0; i < codePoints.length; i++) {
    const current = codePoints[i]!;
    out.push(current);

    if (!emojiVs16Bases.has(current)) {
      continue;
    }
    const next = codePoints[i + 1];
    if (next === VS16 || next === VS15) {
      continue;
    }

    out.push(VS16);
    changed = true;
  }

  if (!changed) {
    return text;
  }
  return out.join('');
}

/** Emoji presentation normalization (VS16) and flag ZWJ cleanup; used by clean-note markdown. */
export function normalizeEmojiText(text: string): string {
  const fixedFlags = removeZwjsBetweenRegionalIndicators(text);
  return ensureEmojiPresentationVs16(fixedFlags);
}

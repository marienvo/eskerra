import type {FrontmatterPropertyType} from './frontmatterTypes';
import type {FrontmatterValue} from './frontmatterTypes';

const MIN_SAMPLES = 3;
const AGREEMENT = 0.7;

/** Single-value heuristic for inference (does not enforce sample size). */
export function detectValueShapeType(value: FrontmatterValue): FrontmatterPropertyType {
  if (typeof value === 'boolean') {
    return 'checkbox';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? 'number' : 'text';
  }
  if (typeof value === 'string') {
    const s = value;
    /* `http:` / `https:` web URLs — not enum-suggested in the desktop editor. */
    if (/^https?:\/\//i.test(s)) {
      return 'url';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return 'date';
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      return 'datetime';
    }
    if (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)
    ) {
      return 'timestamp';
    }
    return 'text';
  }
  if (value === null) {
    return 'text';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'list';
    }
    const allScalarPrimitives = value.every(
      item =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    );
    if (allScalarPrimitives) {
      return 'list';
    }
    return 'text';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  return 'text';
}

export function inferPropertyTypeFromVaultSamples(args: {
  key: string;
  samples: readonly FrontmatterValue[];
}): FrontmatterPropertyType {
  const keyLower = args.key.toLowerCase();
  if (keyLower === 'tags') {
    return 'tags';
  }
  if (keyLower === 'aliases') {
    return 'list';
  }

  const nonNull = args.samples.filter(
    (v): v is FrontmatterValue =>
      v !== undefined && v !== null,
  );
  if (nonNull.length < MIN_SAMPLES) {
    return 'text';
  }

  const types = nonNull.map(detectValueShapeType);
  const counts = new Map<FrontmatterPropertyType, number>();
  for (const t of types) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  let best: FrontmatterPropertyType = 'text';
  let bestCount = 0;
  for (const [t, c] of counts) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }

  if (bestCount / nonNull.length >= AGREEMENT) {
    return best;
  }
  return 'text';
}

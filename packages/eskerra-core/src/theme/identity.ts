/**
 * Display name → kebab-case id for file names (NFKD, strip combining marks, ASCII alnum only).
 */
export function toKebabIdFromName(name: string): string {
  const normalized = name.normalize('NFKD').replace(/\p{M}+/gu, '');
  const slug = normalized
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'theme';
}

/**
 * Picks a unique theme id stem: `base`, `base-2`, `base-3`, … not in `existingStems`.
 */
export function pickUniqueThemeStem(baseKebab: string, existingStems: ReadonlySet<string>): string {
  let candidate = baseKebab;
  let n = 2;
  while (existingStems.has(candidate)) {
    candidate = `${baseKebab}-${n}`;
    n += 1;
  }
  return candidate;
}

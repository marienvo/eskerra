/**
 * Ordered open-tab strip for the vault markdown editor (IDE-style).
 * URIs are normalized via {@link normalizeEditorDocUri}.
 */

import {normalizeEditorDocUri, remapVaultUriPrefix} from './editorDocumentHistory';

export function ensureOpenTab(tabs: readonly string[], uri: string): string[] {
  const n = normalizeEditorDocUri(uri);
  if (!n) {
    return normalizeOpenTabList(tabs);
  }
  const normalized = normalizeOpenTabList(tabs);
  if (normalized.includes(n)) {
    return normalized;
  }
  return [...normalized, n];
}

export function normalizeOpenTabList(tabs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tabs) {
    const u = normalizeEditorDocUri(t);
    if (!u || seen.has(u)) {
      continue;
    }
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function removeOpenTab(tabs: readonly string[], uri: string): string[] {
  const n = normalizeEditorDocUri(uri);
  return normalizeOpenTabList(tabs).filter(t => t !== n);
}

/**
 * After removing `removedNorm` from the tab list, which tab should gain focus?
 * Prefers the tab that was immediately to the right, then the left neighbor.
 */
export function pickNeighborUriAfterRemovingTab(
  tabs: readonly string[],
  removedNorm: string,
): string | null {
  const normalized = normalizeOpenTabList(tabs);
  const idx = normalized.indexOf(removedNorm);
  if (idx < 0 || normalized.length <= 1) {
    return null;
  }
  if (idx + 1 < normalized.length) {
    return normalized[idx + 1]!;
  }
  return normalized[idx - 1]!;
}

/**
 * When the selected URI is no longer in `newTabs`, pick the nearest surviving tab
 * in original `prevTabs` order (prefer right), else first tab in `newTabs`.
 */
export function pickSurvivorAfterSelectedRemovedFromTabs(
  prevTabs: readonly string[],
  newTabs: readonly string[],
  selectedNorm: string,
): string | null {
  const normalizedPrev = normalizeOpenTabList(prevTabs);
  const normalizedNew = normalizeOpenTabList(newTabs);
  if (normalizedNew.includes(selectedNorm)) {
    return selectedNorm;
  }
  const idx = normalizedPrev.indexOf(selectedNorm);
  if (idx < 0) {
    return normalizedNew[0] ?? null;
  }
  const newSet = new Set(normalizedNew);
  for (let i = idx + 1; i < normalizedPrev.length; i++) {
    const u = normalizedPrev[i]!;
    if (newSet.has(u)) {
      return u;
    }
  }
  for (let j = idx - 1; j >= 0; j--) {
    const u = normalizedPrev[j]!;
    if (newSet.has(u)) {
      return u;
    }
  }
  return normalizedNew[0] ?? null;
}

export function remapOpenTabUris(
  tabs: readonly string[],
  oldPrefix: string,
  newPrefix: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const uri of tabs) {
    const u = normalizeEditorDocUri(uri);
    const mapped = remapVaultUriPrefix(u, oldPrefix, newPrefix) ?? u;
    if (!seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

export function removeOpenTabsWhere(
  tabs: readonly string[],
  shouldRemove: (normalizedUri: string) => boolean,
): string[] {
  return normalizeOpenTabList(tabs).filter(t => !shouldRemove(t));
}

export function keepOnlyOpenTab(tabs: readonly string[], keepUri: string): string[] {
  const n = normalizeEditorDocUri(keepUri);
  if (!n) {
    return [];
  }
  return normalizeOpenTabList(tabs).includes(n) ? [n] : [];
}

/** Keeps only `keepUri` in the tab list (normalized). */
export function closeOtherOpenTabs(
  tabs: readonly string[],
  keepUri: string,
): string[] {
  return keepOnlyOpenTab(tabs, keepUri);
}

/**
 * LIFO stack of user-closed editor tab URIs for "Reopen closed tab".
 * URIs are normalized; callers push in the order that makes the next pop()
 * return the most recently user-relevant closed tab first.
 */

import {normalizeVaultBaseUri} from '@eskerra/core';

import {normalizeEditorDocUri} from './editorDocumentHistory';
import {normalizeOpenTabList} from './editorOpenTabs';

export function isEditorClosedTabReopenable(
  uri: string,
  vaultRoot: string | null,
  noteUriSet: ReadonlySet<string>,
): boolean {
  if (!vaultRoot) {
    return false;
  }
  const u = normalizeEditorDocUri(uri);
  const root = normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(
    /\/+$/,
    '',
  );
  const inVault = u === root || u.startsWith(`${root}/`);
  if (!inVault) {
    return false;
  }
  return noteUriSet.has(u) || u.toLowerCase().endsWith('.md');
}

/**
 * Push tabs removed by "close other" so the first reopen is the rightmost removed tab.
 */
export function pushClosedTabsFromCloseOther(
  stack: string[],
  prevTabs: readonly string[],
  keepUri: string,
): void {
  const list = normalizeOpenTabList(prevTabs);
  const keep = normalizeEditorDocUri(keepUri);
  for (let i = list.length - 1; i >= 0; i--) {
    const u = list[i]!;
    if (u !== keep) {
      stack.push(u);
    }
  }
}

/**
 * Push tabs removed by "close all": selected first on reopen, then strip inward from the right.
 */
export function pushClosedTabsFromCloseAll(
  stack: string[],
  prevTabs: readonly string[],
  selectedNorm: string | null,
): void {
  const list = normalizeOpenTabList(prevTabs);
  if (list.length === 0) {
    return;
  }
  const sel =
    selectedNorm && list.includes(selectedNorm) ? selectedNorm : null;
  if (sel) {
    for (let i = list.length - 1; i >= 0; i--) {
      const u = list[i]!;
      if (u !== sel) {
        stack.push(u);
      }
    }
    stack.push(sel);
  } else {
    for (let i = list.length - 1; i >= 0; i--) {
      stack.push(list[i]!);
    }
  }
}

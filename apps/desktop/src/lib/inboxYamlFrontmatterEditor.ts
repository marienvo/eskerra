import {innerToFencedFrontmatterBlock, mergeYamlFrontmatterBody} from '@eskerra/core';
import type {MutableRefObject} from 'react';

/**
 * Reconstructs the on-disk markdown from the CodeMirror slice and shell-held YAML metadata
 * (same for inbox notes and `Today.md` hub files).
 */
export function inboxEditorSliceToFullMarkdown(
  editorSlice: string,
  selectedUri: string | null,
  composingNewEntry: boolean,
  yamlInner: string | null,
  yamlLeading: string,
): string {
  if (!selectedUri || composingNewEntry) {
    return editorSlice.replace(/\r\n/g, '\n');
  }
  const yamlBlock =
    yamlInner == null ? null : innerToFencedFrontmatterBlock(yamlInner);
  return mergeYamlFrontmatterBody(yamlBlock, editorSlice, yamlLeading);
}

export function clearInboxYamlFrontmatterEditorRefs(args: {
  inner: MutableRefObject<string | null>;
  leading: MutableRefObject<string>;
  setInner: (inner: string | null) => void;
  setLeading?: (leading: string) => void;
}): void {
  args.inner.current = null;
  args.leading.current = '';
  args.setInner(null);
  args.setLeading?.('');
}

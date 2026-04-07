import {mergeYamlFrontmatterBody} from '@eskerra/core';
import type {MutableRefObject} from 'react';

/**
 * Reconstructs the on-disk markdown from the CodeMirror slice and shell-held YAML metadata
 * (same for inbox notes and `Today.md` hub files).
 */
export function inboxEditorSliceToFullMarkdown(
  editorSlice: string,
  selectedUri: string | null,
  composingNewEntry: boolean,
  yamlBlock: string | null,
  yamlLeading: string,
): string {
  if (!selectedUri || composingNewEntry) {
    return editorSlice.replace(/\r\n/g, '\n');
  }
  return mergeYamlFrontmatterBody(yamlBlock, editorSlice, yamlLeading);
}

export function clearInboxYamlFrontmatterEditorRefs(args: {
  block: MutableRefObject<string | null>;
  leading: MutableRefObject<string>;
}): void {
  args.block.current = null;
  args.leading.current = '';
}

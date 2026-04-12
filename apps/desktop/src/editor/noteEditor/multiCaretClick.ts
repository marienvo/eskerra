import type {Extension} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

/** Matches {@link reopenClosedTabMenuShortcutLabel} mac detection (editor runs in a browser shell). */
export function isMacLikeEditorPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? '';
  return /^Mac/i.test(platform) || ua.includes('Mac OS');
}

/**
 * Whether a selecting click should add a range instead of replacing the selection.
 * CodeMirror default is Meta on macOS and Ctrl elsewhere; we also treat Alt as add-caret (VS Code–style on Linux).
 */
export function clickAddsSelectionRangePredicate(
  event: Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey'>,
  isMac: boolean,
): boolean {
  return event.altKey || (isMac ? event.metaKey : event.ctrlKey);
}

export function multiCaretClickAddsSelectionRangeExtension(): Extension {
  return EditorView.clickAddsSelectionRange.of(event =>
    clickAddsSelectionRangePredicate(event, isMacLikeEditorPlatform()),
  );
}

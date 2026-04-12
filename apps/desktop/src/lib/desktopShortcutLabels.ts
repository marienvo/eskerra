/** Labels shown next to menu items (US English); mod key reflects typical OS conventions. */

export function reopenClosedTabMenuShortcutLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Ctrl+Shift+T';
  }
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? '';
  if (/^Mac/i.test(platform) || ua.includes('Mac OS')) {
    return '⌘⇧T';
  }
  return 'Ctrl+Shift+T';
}

/** Clean this note (markdown normalize); shown in editor context menu. */
export function cleanNoteMenuShortcutLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Ctrl+E';
  }
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? '';
  if (/^Mac/i.test(platform) || ua.includes('Mac OS')) {
    return '⌘E';
  }
  return 'Ctrl+E';
}

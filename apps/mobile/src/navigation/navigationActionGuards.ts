/** True when the navigation action targets the Inbox stack AddNote screen (e.g. edit from note detail). */
export function isNavigateToAddNoteAction(action: unknown): boolean {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return false;
  }
  if ((action as { type: string }).type !== 'NAVIGATE') {
    return false;
  }
  const payload = (action as { payload?: { name?: string } }).payload;
  return payload?.name === 'AddNote';
}

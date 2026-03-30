export function normalizeNoteUri(noteUri: string): string {
  const normalizedUri = noteUri.trim();

  if (!normalizedUri) {
    throw new Error('Note URI cannot be empty.');
  }

  return normalizedUri;
}

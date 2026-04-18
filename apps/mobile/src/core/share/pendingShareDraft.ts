let draft: string | null = null;

export function setPendingShareDraft(text: string): void {
  const trimmed = text.trim();
  draft = trimmed ? trimmed : null;
}

export function consumePendingShareDraft(): string | null {
  const d = draft;
  draft = null;
  return d;
}

export function hasPendingShareDraft(): boolean {
  return draft !== null;
}

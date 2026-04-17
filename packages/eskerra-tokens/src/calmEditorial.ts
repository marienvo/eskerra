/**
 * Calm Editorial foundation — canonical hex names from
 * specs/design/design-system-calm-editorial.md
 * Desktop shell may map these to CSS vars; mobile should align hex values.
 */
export const calmEditorial = {
  background: '#F7F6F3',
  surface: '#FFFFFF',
  textPrimary: '#111111',
  textSecondary: '#6B6B6B',
  border: '#E5E3DF',
  accent: '#4FAFE6',
  accentHover: '#3A97CC',
  accentSubtleBg: '#EAF6FD',
  editorBackground: '#F7F6F3',
  editorText: '#111111',
  semanticRecording: '#E35D5D',
  semanticSuccess: '#5FAF7A',
  semanticWarning: '#D9A441',
  semanticDraft: '#6B6B6B',
  danger: '#9E3A3A',
  dangerSurface: '#FDEDEC',
  dangerBorder: '#E8C4C4',
} as const;

export type CalmEditorialToken = keyof typeof calmEditorial;

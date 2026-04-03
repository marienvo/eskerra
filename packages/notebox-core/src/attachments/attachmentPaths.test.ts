import {describe, expect, test} from 'vitest';

import {
  buildAttachmentFileName,
  buildInboxRelativeAttachmentMarkdownPath,
  imageMimeToExtension,
  inboxNoteRelativeAttachmentDir,
  normalizeImageFileExtension,
  sanitizeAttachmentBaseName,
} from './attachmentPaths';

describe('sanitizeAttachmentBaseName', () => {
  test('strips paths and extension, lowercases, replaces spaces', () => {
    expect(sanitizeAttachmentBaseName('Photo FINAL.PNG')).toBe('photo-final');
  });

  test('handles names without extension', () => {
    expect(sanitizeAttachmentBaseName('screenshot')).toBe('screenshot');
  });

  test('falls back when empty after sanitize', () => {
    expect(sanitizeAttachmentBaseName('!!!')).toBe('image');
  });
});

describe('normalizeImageFileExtension', () => {
  test('accepts known extensions with or without dot', () => {
    expect(normalizeImageFileExtension('png')).toBe('.png');
    expect(normalizeImageFileExtension('.JPG')).toBe('.jpg');
  });

  test('rejects unknown extensions', () => {
    expect(normalizeImageFileExtension('.exe')).toBeNull();
  });
});

describe('buildAttachmentFileName', () => {
  test('builds predictable name with token', () => {
    expect(buildAttachmentFileName('shot', '.png', 'abc123')).toBe('shot-abc123.png');
  });

  test('throws on bad extension', () => {
    expect(() => buildAttachmentFileName('a', '.exe', '1')).toThrow();
  });
});

describe('buildInboxRelativeAttachmentMarkdownPath', () => {
  test('returns stable relative path for flat inbox notes', () => {
    expect(inboxNoteRelativeAttachmentDir()).toBe('../Assets/Attachments');
    expect(buildInboxRelativeAttachmentMarkdownPath('x.png')).toBe('../Assets/Attachments/x.png');
  });

  test('rejects path segments in file name', () => {
    expect(() => buildInboxRelativeAttachmentMarkdownPath('a/b.png')).toThrow();
  });
});

describe('imageMimeToExtension', () => {
  test('maps common mimes', () => {
    expect(imageMimeToExtension('image/png')).toBe('.png');
    expect(imageMimeToExtension('IMAGE/JPEG')).toBe('.jpg');
    expect(imageMimeToExtension('image/svg+xml')).toBe('.svg');
  });

  test('returns null for unknown', () => {
    expect(imageMimeToExtension('application/octet-stream')).toBeNull();
  });
});

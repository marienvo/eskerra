import {describe, expect, it} from 'vitest';

import {isNoteAttachmentImageFilePath} from './noteInboxAttachmentHost';

describe('isNoteAttachmentImageFilePath', () => {
  it('accepts common raster and svg extensions', () => {
    expect(isNoteAttachmentImageFilePath('/x/photo.PNG')).toBe(true);
    expect(isNoteAttachmentImageFilePath('C:\\vault\\a.jpeg')).toBe(true);
    expect(isNoteAttachmentImageFilePath('image.webp')).toBe(true);
    expect(isNoteAttachmentImageFilePath('diagram.svg')).toBe(true);
  });

  it('rejects non-image paths', () => {
    expect(isNoteAttachmentImageFilePath('/x/note.md')).toBe(false);
    expect(isNoteAttachmentImageFilePath('')).toBe(false);
  });
});

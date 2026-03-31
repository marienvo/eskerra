import {describe, expect, it} from 'vitest';

import {
  clipboardDataProbablyHasVaultImage,
  extractBlobImageSrcsFromHtml,
  extractClipboardImageUrlsFromHtml,
} from './clipboardImageFiles';

describe('extractClipboardImageUrlsFromHtml', () => {
  it('collects blob and data:image sources in document order', () => {
    const html =
      '<div><img src="data:image/png;base64,iVBORw0KGgo="></div><img src="blob:http://localhost/x">';
    const {blobUrls, dataImageUrls} = extractClipboardImageUrlsFromHtml(html);
    expect(dataImageUrls.length).toBe(1);
    expect(dataImageUrls[0].startsWith('data:image/png')).toBe(true);
    expect(blobUrls).toEqual(['blob:http://localhost/x']);
  });

  it('dedupes repeated src values', () => {
    const html =
      '<img src="data:image/gif;base64,R0lGODlh"><img src="data:image/gif;base64,R0lGODlh">';
    const {dataImageUrls} = extractClipboardImageUrlsFromHtml(html);
    expect(dataImageUrls.length).toBe(1);
  });

  it('ignores non-image data URLs and http images', () => {
    const html =
      '<img src="data:text/plain;base64,AA"><img src="https://x/y.png">';
    const {blobUrls, dataImageUrls} = extractClipboardImageUrlsFromHtml(html);
    expect(blobUrls).toEqual([]);
    expect(dataImageUrls).toEqual([]);
  });

  it('returns empty when no img with transient src', () => {
    expect(extractClipboardImageUrlsFromHtml('<p>hi</p>')).toEqual({
      blobUrls: [],
      dataImageUrls: [],
    });
  });

  it('parses uppercase IMG tags with blob src', () => {
    const html = '<IMG SRC="blob:http://localhost/x">';
    expect(extractClipboardImageUrlsFromHtml(html).blobUrls).toEqual([
      'blob:http://localhost/x',
    ]);
  });

  it('parses img without relying on raw substring pre-check (https-only src)', () => {
    const html = '<img src="https://example.com/y.png">';
    expect(extractClipboardImageUrlsFromHtml(html)).toEqual({
      blobUrls: [],
      dataImageUrls: [],
    });
  });
});

describe('extractBlobImageSrcsFromHtml', () => {
  it('delegates to shared extraction', () => {
    const html = '<img src="blob:http://x/y">';
    expect(extractBlobImageSrcsFromHtml(html)).toEqual(['blob:http://x/y']);
  });
});

describe('clipboardDataProbablyHasVaultImage', () => {
  it('is true when HTML embeds data:image without clipboard files', () => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<img src="data:image/png;base64,AAAA">');
    expect(clipboardDataProbablyHasVaultImage(dt)).toBe(true);
  });

  it('is true for img+transient hint when DOMParser yields no src (fallback)', () => {
    const dt = new DataTransfer();
    dt.setData(
      'text/html',
      '<img broken attr blob:http://localhost/x data:image/png;base64,QQ>',
    );
    expect(clipboardDataProbablyHasVaultImage(dt)).toBe(true);
  });
});

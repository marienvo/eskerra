import {
  imageSniffFormatToDotExtension,
  sniffImageFormatFromBytes,
} from '@notebox/core';

/** Sync hint before `preventDefault` (MIME, extension, or ambiguous types worth sniffing). */
export function fileMightBeClipboardImageByMeta(file: File): boolean {
  const t = file.type.trim().toLowerCase();
  if (t.startsWith('image/')) {
    return true;
  }
  if (t === '' || t === 'application/octet-stream') {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

export async function isProbablyClipboardImageFile(file: File): Promise<boolean> {
  const t = file.type.trim().toLowerCase();
  if (t.startsWith('image/')) {
    return true;
  }
  if (t !== '' && t !== 'application/octet-stream') {
    return false;
  }
  const buf = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return sniffImageFormatFromBytes(buf) !== null;
}

function dedupeFileKey(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

export async function collectClipboardImageFilesFromFileList(
  files: FileList,
): Promise<File[]> {
  const out: File[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const file = files.item(i);
    if (!file) {
      continue;
    }
    if (!(await isProbablyClipboardImageFile(file))) {
      continue;
    }
    const key = dedupeFileKey(file);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(file);
  }
  return out;
}

export async function collectClipboardImageFilesFromDataTransfer(
  dt: DataTransfer,
): Promise<File[]> {
  const seen = new Set<string>();
  const fromItems: File[] = [];

  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') {
        continue;
      }
      const file = item.getAsFile();
      if (!file) {
        continue;
      }
      if (!(await isProbablyClipboardImageFile(file))) {
        continue;
      }
      const key = dedupeFileKey(file);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      fromItems.push(file);
    }
  }

  if (fromItems.length > 0) {
    return fromItems;
  }

  return collectClipboardImageFilesFromFileList(dt.files);
}

/** Synchronous: should we take over paste before ProseMirror ingests `blob:` HTML? */
export function clipboardDataProbablyHasVaultImage(dt: DataTransfer): boolean {
  const types = Array.from(dt.types);
  if (
    types.some(
      t =>
        t === 'image/png' ||
        t === 'image/jpeg' ||
        t === 'image/jpg' ||
        t === 'image/gif' ||
        t === 'image/webp' ||
        t.startsWith('image/'),
    )
  ) {
    return true;
  }
  const html = dt.getData('text/html');
  if (html) {
    const { blobUrls, dataImageUrls } = extractClipboardImageUrlsFromHtml(html);
    if (blobUrls.length > 0 || dataImageUrls.length > 0) {
      return true;
    }
    // Fallback when HTML clearly embeds an image but DOMParser missed src (edge markup).
    if (/<img\b/i.test(html)) {
      const lower = html.toLowerCase();
      if (lower.includes('blob:') || lower.includes('data:image')) {
        return true;
      }
    }
  }
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files.item(i);
    if (f && fileMightBeClipboardImageByMeta(f)) {
      return true;
    }
  }
  if (dt.items) {
    for (let i = 0; i < dt.items.length; i++) {
      const ty = dt.items[i].type;
      if (ty.startsWith('image/')) {
        return true;
      }
    }
  }
  return false;
}

/** `blob:` and `data:image/` src values on `<img>` in pasted HTML. */
export function extractClipboardImageUrlsFromHtml(html: string): {
  blobUrls: string[];
  dataImageUrls: string[];
} {
  // Parse whenever clipboard HTML includes an <img>; do not require a substring
  // pre-check (case or format differ between WebKit, GTK, and Chromium).
  if (!html || !/<img\b/i.test(html)) {
    return { blobUrls: [], dataImageUrls: [] };
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imgs = doc.querySelectorAll('img[src]');
    const blobSeen = new Set<string>();
    const dataSeen = new Set<string>();
    const blobUrls: string[] = [];
    const dataImageUrls: string[] = [];
    imgs.forEach(img => {
      const s = img.getAttribute('src')?.trim();
      if (!s) {
        return;
      }
      if (s.startsWith('blob:')) {
        if (!blobSeen.has(s)) {
          blobSeen.add(s);
          blobUrls.push(s);
        }
      } else if (/^data:image\//i.test(s)) {
        if (!dataSeen.has(s)) {
          dataSeen.add(s);
          dataImageUrls.push(s);
        }
      }
    });
    return { blobUrls, dataImageUrls };
  } catch {
    return { blobUrls: [], dataImageUrls: [] };
  }
}

export function extractBlobImageSrcsFromHtml(html: string): string[] {
  return extractClipboardImageUrlsFromHtml(html).blobUrls;
}

/** Use sniffed format when clipboard file has no useful name or MIME. */
export function dotExtensionForClipboardBytes(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
): string {
  const fromMime = mimeType.trim().toLowerCase();
  if (fromMime === 'image/jpeg' || fromMime === 'image/jpg') {
    return '.jpg';
  }
  if (fromMime === 'image/png') {
    return '.png';
  }
  if (fromMime === 'image/gif') {
    return '.gif';
  }
  if (fromMime === 'image/webp') {
    return '.webp';
  }
  if (fromMime === 'image/svg+xml') {
    return '.svg';
  }

  const lower = fileName.toLowerCase();
  for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']) {
    if (lower.endsWith(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  }

  const sniffed = sniffImageFormatFromBytes(bytes.subarray(0, Math.min(bytes.length, 64)));
  return sniffed ? imageSniffFormatToDotExtension(sniffed) : '.png';
}

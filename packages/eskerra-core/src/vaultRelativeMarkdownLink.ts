import type {InboxWikiLinkNoteRef} from './wikiLinkInbox';
import {
  normalizeVaultBaseUri,
  MARKDOWN_EXTENSION,
} from './vaultLayout';
import {
  tryAssertVaultMarkdownNoteUriForCrud,
} from './vaultMarkdownPaths';
import {vaultPathDirname} from './vaultVisibility';

function normSlashes(s: string): string {
  return s.trim().replace(/\\/g, '/');
}

/** Strips query and fragment; trims. */
export function stripMarkdownLinkHrefToPathPart(raw: string): string {
  let s = raw.trim();
  const q = s.indexOf('?');
  if (q >= 0) {
    s = s.slice(0, q).trimEnd();
  }
  const h = s.indexOf('#');
  if (h >= 0) {
    s = s.slice(0, h).trimEnd();
  }
  return s.trim();
}

/** True when `href` uses a URL scheme (`http:`, `mailto:`, `//example`, …). */
export function isExternalMarkdownHref(href: string): boolean {
  const h = href.trim();
  if (h === '' || h.startsWith('//')) {
    return true;
  }
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h);
}

const BROWSER_OPENABLE_MARKDOWN_SCHEMES = new Set([
  'http',
  'https',
  'mailto',
]);

/**
 * True when `href` may be opened in the system browser from the desktop markdown editor.
 * Allowlist: `http`, `https`, `mailto` (scheme must be present; protocol-relative URLs are excluded).
 */
export function isBrowserOpenableMarkdownHref(href: string): boolean {
  const h = href.trim();
  if (h === '') {
    return false;
  }
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(h);
  if (!m) {
    return false;
  }
  return BROWSER_OPENABLE_MARKDOWN_SCHEMES.has(m[1]!.toLowerCase());
}

function tryDecodeUriComponent(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Joins `rel` onto `baseDirUri` (POSIX, forward slashes). `rel` must not be external.
 */
export function posixResolveRelativeToDirectory(
  baseDirUri: string,
  rel: string,
): string {
  const relDecoded = tryDecodeUriComponent(rel.trim());
  const baseParts = normSlashes(baseDirUri).replace(/\/+$/, '').split('/').filter(Boolean);
  const relParts = relDecoded.split('/').filter(p => p !== '' && p !== '.');
  const stack = [...baseParts];
  for (const p of relParts) {
    if (p === '..') {
      stack.pop();
    } else {
      stack.push(p);
    }
  }
  return `/${stack.join('/')}`;
}

/**
 * Relative path from `fromDirUri` (directory) to `toFileUri` (file), forward slashes.
 * Same-directory targets use `./file.md`.
 */
export function posixRelativeVaultPath(fromDirUri: string, toFileUri: string): string {
  const fromParts = normSlashes(fromDirUri).replace(/\/+$/, '').split('/').filter(Boolean);
  const toParts = normSlashes(toFileUri).split('/').filter(Boolean);
  let i = 0;
  const max = Math.min(fromParts.length, toParts.length);
  while (
    i < max
    && fromParts[i]!.toLowerCase() === toParts[i]!.toLowerCase()
  ) {
    i++;
  }
  const up = fromParts.length - i;
  const down = toParts.slice(i);
  if (up === 0 && down.length === 1) {
    return `./${down[0]!}`;
  }
  const upSeg = up === 0 ? '' : `${[...Array(up)].map(() => '..').join('/')}/`;
  return `${upSeg}${down.join('/')}`;
}

function canonicalVaultNoteUriFromRefs(
  resolvedUri: string,
  noteRefs: ReadonlyArray<InboxWikiLinkNoteRef>,
): string | undefined {
  const norm = normSlashes(resolvedUri);
  const folded = norm.toLowerCase();
  let match: string | undefined;
  for (const ref of noteRefs) {
    if (normSlashes(ref.uri).toLowerCase() === folded) {
      if (match !== undefined && match !== ref.uri) {
        return undefined;
      }
      match = normSlashes(ref.uri);
    }
  }
  return match;
}

export type ResolveVaultRelativeMarkdownHrefResult = {
  uri: string;
  /** Present when casing or path should be normalized in source. */
  canonicalHref?: string;
};

function sourceDirectoryForRelativeLink(
  sourceMarkdownUriOrDir: string,
): string {
  const n = normSlashes(sourceMarkdownUriOrDir);
  if (n.toLowerCase().endsWith(MARKDOWN_EXTENSION.toLowerCase())) {
    return vaultPathDirname(n);
  }
  return n.replace(/\/+$/, '');
}

/**
 * Resolves a relative inline-markdown `href` to a vault `.md` URI, or `null`.
 * `sourceMarkdownUriOrDir` is either the open note URI (ends with `.md`) or an absolute vault
 * directory URI (for example the Inbox folder while composing a note).
 * Optional `noteRefs` folds casing to a canonical indexed URI when exactly one note matches.
 */
export function resolveVaultRelativeMarkdownHref(
  vaultRoot: string,
  sourceMarkdownUriOrDir: string,
  rawHref: string,
  noteRefs?: ReadonlyArray<InboxWikiLinkNoteRef>,
): ResolveVaultRelativeMarkdownHrefResult | null {
  const pathPart = stripMarkdownLinkHrefToPathPart(rawHref);
  if (pathPart === '' || isExternalMarkdownHref(pathPart)) {
    return null;
  }
  if (!pathPart.toLowerCase().endsWith(MARKDOWN_EXTENSION.toLowerCase())) {
    return null;
  }
  const base = normSlashes(normalizeVaultBaseUri(vaultRoot)).replace(/\/+$/, '');
  const dir = sourceDirectoryForRelativeLink(sourceMarkdownUriOrDir);
  const decodedPart = tryDecodeUriComponent(pathPart);
  const joined = decodedPart.startsWith('/')
    ? normSlashes(decodedPart)
    : posixResolveRelativeToDirectory(dir, pathPart);
  const validated = tryAssertVaultMarkdownNoteUriForCrud(base, joined);
  if (!validated) {
    return null;
  }
  let uri = validated;
  let canonicalHref: string | undefined;
  if (noteRefs && noteRefs.length > 0) {
    const canon = canonicalVaultNoteUriFromRefs(validated, noteRefs);
      if (canon) {
      uri = canon;
      const nextHref = posixRelativeVaultPath(dir, canon);
      const stripped = stripMarkdownLinkHrefToPathPart(rawHref);
      const compareRaw = normSlashes(stripped);
      const compareDecoded = normSlashes(tryDecodeUriComponent(stripped));
      if (nextHref !== compareRaw && nextHref !== compareDecoded) {
        canonicalHref = nextHref;
      }
    }
  }
  return {uri, ...(canonicalHref ? {canonicalHref} : {})};
}

export type InlineMarkdownLinkMatch = {
  fullMatchStart: number;
  fullMatchEnd: number;
  hrefStart: number;
  hrefEnd: number;
  isImage: boolean;
};

function findWikiLinkEnd(s: string, openBracketIdx: number): number {
  if (s.slice(openBracketIdx, openBracketIdx + 2) !== '[[') {
    return openBracketIdx;
  }
  let j = openBracketIdx + 2;
  while (j < s.length - 1) {
    if (s[j] === ']' && s[j + 1] === ']') {
      return j + 2;
    }
    j++;
  }
  return s.length;
}

function scanInlineLink(
  s: string,
  labelOpenIdx: number,
  isImage: boolean,
): InlineMarkdownLinkMatch | null {
  let j = labelOpenIdx + (isImage ? 2 : 1);
  while (j < s.length) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length) {
      j += 2;
      continue;
    }
    if (c === ']') {
      break;
    }
    j++;
  }
  if (j >= s.length || s[j] !== ']') {
    return null;
  }
  const afterLabel = j + 1;
  let k = afterLabel;
  while (k < s.length && /\s/.test(s[k]!)) {
    k++;
  }
  if (k >= s.length || s[k] !== '(') {
    return null;
  }
  let u = k + 1;
  while (u < s.length) {
    const c = s[u];
    if (c === '\\' && u + 1 < s.length) {
      u += 2;
      continue;
    }
    if (c === ')') {
      const hrefStart = k + 1;
      const hrefEnd = u;
      return {
        fullMatchStart: isImage ? labelOpenIdx : labelOpenIdx,
        fullMatchEnd: u + 1,
        hrefStart,
        hrefEnd,
        isImage,
      };
    }
    u++;
  }
  return null;
}

/**
 * Extracts inline `[text](href)` spans (and images) with byte offsets in `markdown` (UTF-16 indices
 * match JS string positions).
 */
export function extractInlineMarkdownLinksFromMarkdown(
  markdown: string,
): InlineMarkdownLinkMatch[] {
  const out: InlineMarkdownLinkMatch[] = [];
  let i = 0;
  while (i < markdown.length) {
    if (markdown[i] === '[' && markdown[i + 1] === '[') {
      i = findWikiLinkEnd(markdown, i);
      continue;
    }
    if (markdown[i] === '!' && markdown[i + 1] === '[') {
      const m = scanInlineLink(markdown, i, true);
      if (m) {
        out.push(m);
        i = m.fullMatchEnd;
        continue;
      }
    }
    if (markdown[i] === '[') {
      const m = scanInlineLink(markdown, i, false);
      if (m) {
        out.push(m);
        i = m.fullMatchEnd;
        continue;
      }
    }
    i++;
  }
  return out;
}

export type InboxRelativeMarkdownLinkRenameMarkdownPlan = {
  changed: boolean;
  markdown: string;
  updatedLinkCount: number;
};

export function planInboxRelativeMarkdownLinkRenameInMarkdown(options: {
  markdown: string;
  sourceUri: string;
  oldTargetUri: string;
  newTargetUri: string;
  vaultRoot: string;
  noteRefs: ReadonlyArray<InboxWikiLinkNoteRef>;
}): InboxRelativeMarkdownLinkRenameMarkdownPlan {
  const {
    markdown,
    sourceUri,
    oldTargetUri,
    newTargetUri,
    vaultRoot,
    noteRefs,
  } = options;
  const matches = extractInlineMarkdownLinksFromMarkdown(markdown);
  const oldNorm = normSlashes(oldTargetUri);
  const newNorm = normSlashes(newTargetUri);
  const sourceNorm = normSlashes(sourceUri);
  const dir = vaultPathDirname(sourceNorm);

  const edits: Array<{start: number; end: number; text: string}> = [];
  let updatedLinkCount = 0;

  for (const m of matches) {
    if (m.isImage) {
      continue;
    }
    const hrefRaw = markdown.slice(m.hrefStart, m.hrefEnd);
    const resolved = resolveVaultRelativeMarkdownHref(
      vaultRoot,
      sourceUri,
      hrefRaw,
      noteRefs,
    );
    if (
      !resolved
      || normSlashes(resolved.uri).toLowerCase() !== oldNorm.toLowerCase()
    ) {
      continue;
    }
    const nextHref = posixRelativeVaultPath(dir, newNorm);
    edits.push({
      start: m.hrefStart,
      end: m.hrefEnd,
      text: nextHref,
    });
    updatedLinkCount++;
  }

  if (updatedLinkCount === 0) {
    return {changed: false, markdown, updatedLinkCount: 0};
  }

  edits.sort((a, b) => b.start - a.start);
  let out = markdown;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return {changed: true, markdown: out, updatedLinkCount};
}

/**
 * Lists vault markdown notes whose bodies link to `targetUri` via a relative `.md` inline link.
 */
export function listInboxRelativeMarkdownLinkBacklinkReferrersForTarget(options: {
  targetUri: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  contentByUri: Readonly<Record<string, string>>;
  activeUri: string | null;
  activeBody: string;
  vaultRoot: string;
}): readonly string[] {
  const {targetUri, notes, contentByUri, activeUri, activeBody, vaultRoot} = options;
  const referrers = new Set<string>();
  const targetNorm = normSlashes(targetUri);

  for (const source of notes) {
    const sourceBody =
      activeUri != null && source.uri === activeUri
        ? activeBody
        : (contentByUri[source.uri] ?? '');
    const links = extractInlineMarkdownLinksFromMarkdown(sourceBody);
    for (const m of links) {
      if (m.isImage) {
        continue;
      }
      const hrefRaw = sourceBody.slice(m.hrefStart, m.hrefEnd);
      const resolved = resolveVaultRelativeMarkdownHref(
        vaultRoot,
        source.uri,
        hrefRaw,
        notes,
      );
      if (!resolved) {
        continue;
      }
      if (resolved.uri === source.uri) {
        continue;
      }
      if (
        normSlashes(resolved.uri).toLowerCase() === targetNorm.toLowerCase()
      ) {
        referrers.add(source.uri);
      }
    }
  }

  return [...referrers].sort((a, b) => a.localeCompare(b));
}

import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import type {EditorState} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';
import {isBrowserOpenableMarkdownHref} from '@notebox/core';

const TREE_ENSURE_MS = 200;

const BARE_HTTP_URL_RE = /\bhttps?:\/\/[^\s<>`[\]]+/g;
const BARE_MAILTO_RE = /\bmailto:[^\s<>`[\]]+/gi;

function trimAutolinkHref(raw: string): string {
  let s = raw;
  while (s.length > 0) {
    const c = s[s.length - 1]!;
    if (
      c === ')'
      || c === ']'
      || c === '}'
      || c === "'"
      || c === '"'
      || c === '>'
    ) {
      s = s.slice(0, -1);
      continue;
    }
    if (/[.,;:!?]/.test(c)) {
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return s;
}

function rangeInBareUrlExcludedMarkdownContext(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const mid = Math.min(Math.max(0, Math.floor((from + to - 1) / 2)), state.doc.length - 1);
  if (mid < 0) {
    return true;
  }
  let n: SyntaxNode | null = syntaxTree(state).resolveInner(mid, -1);
  for (; n != null; n = n.parent) {
    const name = n.name;
    if (
      name === 'Link'
      || name === 'Image'
      || name === 'InlineCode'
      || name === 'CodeBlock'
      || name === 'FencedCode'
    ) {
      return true;
    }
  }
  return false;
}

export type BareBrowserUrlInterval = {from: number; to: number; href: string};

/**
 * Raw `http`/`https`/`mailto` spans outside of Lezer Link/Image/code constructs, for autolink styling and activation.
 */
export function collectBareBrowserUrlIntervals(
  state: EditorState,
): BareBrowserUrlInterval[] {
  ensureSyntaxTree(state, state.doc.length, TREE_ENSURE_MS);
  const text = state.doc.toString();
  const out: BareBrowserUrlInterval[] = [];

  const pushMatch = (from: number, raw: string) => {
    const href = trimAutolinkHref(raw);
    if (href.length === 0) {
      return;
    }
    const to = from + href.length;
    if (rangeInBareUrlExcludedMarkdownContext(state, from, to)) {
      return;
    }
    if (!isBrowserOpenableMarkdownHref(href)) {
      return;
    }
    out.push({from, to, href});
  };

  BARE_HTTP_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_HTTP_URL_RE.exec(text)) !== null) {
    pushMatch(m.index, m[0]!);
  }

  BARE_MAILTO_RE.lastIndex = 0;
  while ((m = BARE_MAILTO_RE.exec(text)) !== null) {
    pushMatch(m.index, m[0]!);
  }

  out.sort((a, b) => a.from - b.from || b.to - a.to);
  const deduped: BareBrowserUrlInterval[] = [];
  for (const iv of out) {
    const last = deduped[deduped.length - 1];
    if (last && iv.from < last.to) {
      continue;
    }
    deduped.push(iv);
  }
  return deduped;
}

export function markdownBareBrowserUrlAtPosition(
  state: EditorState,
  pos: number,
): {href: string; hrefFrom: number} | null {
  for (const iv of collectBareBrowserUrlIntervals(state)) {
    if (pos >= iv.from && pos < iv.to) {
      return {href: iv.href, hrefFrom: iv.from};
    }
  }
  return null;
}

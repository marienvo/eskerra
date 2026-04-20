import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {highlightTree} from '@lezer/highlight';
import {isBrowserOpenableMarkdownHref, wikiLinkInnerBrowserOpenableHref} from '@eskerra/core';

import {
  CM_MD_EXTERNAL_BARE_URL_CLASS,
  CM_MD_EXTERNAL_LINK_GLYPH_CLASS,
} from '../markdownExternalLinkCodemirror';
import {collectBareBrowserUrlIntervals} from '../markdownBareUrl';
import {isActivatableRelativeMarkdownHref} from '../markdownActivatableRelativeHref';
import {markdownEskerra} from '../markdownEskerraLanguage';
import {
  noteMarkdownHighlightStyle,
  noteMarkdownParserExtensions,
} from '../markdownEditorStyling';
import {relativeMarkdownLinkLabelSpan} from '../relativeMarkdownLinkLabelSpan';
import {WIKI_LINK_LINE_RE} from '../wikiLinkCodemirror';

const TREE_ENSURE_MS = 200;

export type CellStaticSegment = {from: number; to: number; className: string};

export type CellStaticResolvePredicates = {
  wikiTargetIsResolved: (inner: string) => boolean;
  relativeMarkdownLinkHrefIsResolved: (href: string) => boolean;
};

type StyledInterval = {from: number; to: number; priority: number; classes: string};

function joinOrPush(
  out: CellStaticSegment[],
  a: number,
  b: number,
  className: string,
): void {
  const last = out[out.length - 1];
  if (last && last.className === className && last.to === a) {
    last.to = b;
  } else {
    out.push({from: a, to: b, className});
  }
}

export function mergeStyledIntervals(
  textLen: number,
  intervals: StyledInterval[],
): CellStaticSegment[] {
  if (textLen === 0) {
    return [];
  }
  const breaks = new Set<number>([0, textLen]);
  const clipped: StyledInterval[] = [];
  for (const iv of intervals) {
    const a = Math.max(0, Math.min(iv.from, textLen));
    const b = Math.max(0, Math.min(iv.to, textLen));
    if (a < b) {
      breaks.add(a);
      breaks.add(b);
      clipped.push({from: a, to: b, priority: iv.priority, classes: iv.classes});
    }
  }
  const sorted = [...breaks].sort((x, y) => x - y);
  const byStart = [...clipped].sort((x, y) => x.from - y.from || x.to - y.to);
  const active: StyledInterval[] = [];
  let startIdx = 0;
  const out: CellStaticSegment[] = [];

  for (let k = 0; k < sorted.length - 1; k += 1) {
    const a = sorted[k]!;
    const b = sorted[k + 1]!;
    if (a === b) {
      continue;
    }
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i]!.to <= a) {
        active.splice(i, 1);
      }
    }
    while (startIdx < byStart.length && byStart[startIdx]!.from <= a) {
      const iv = byStart[startIdx]!;
      if (iv.to > a) {
        active.push(iv);
      }
      startIdx += 1;
    }
    const covering = active.filter(iv => a >= iv.from && a < iv.to);
    if (covering.length === 0) {
      joinOrPush(out, a, b, '');
      continue;
    }
    const maxP = Math.max(...covering.map(c => c.priority));
    const winners = covering.filter(c => c.priority === maxP);
    const classSet = new Set<string>();
    for (const w of winners) {
      for (const p of w.classes.split(/\s+/)) {
        if (p) {
          classSet.add(p);
        }
      }
    }
    joinOrPush(out, a, b, [...classSet].sort().join(' '));
  }
  return out;
}

function collectLezerIntervals(textLen: number, tree: Parameters<typeof highlightTree>[0]): StyledInterval[] {
  const out: StyledInterval[] = [];
  highlightTree(tree, noteMarkdownHighlightStyle, (from, to, classes) => {
    if (!classes) {
      return;
    }
    const t = Math.min(to, textLen);
    if (from < t) {
      out.push({from, to: t, priority: 0, classes});
    }
  });
  return out;
}

function collectWikiIntervals(
  doc: EditorState['doc'],
  wikiResolved: (inner: string) => boolean,
): StyledInterval[] {
  const out: StyledInterval[] = [];
  for (let i = 1; i <= doc.lines; i += 1) {
    const line = doc.line(i);
    const text = line.text;
    WIKI_LINK_LINE_RE.lastIndex = 0;
    let match = WIKI_LINK_LINE_RE.exec(text);
    while (match) {
      const start = match.index;
      const fullLen = match[0].length;
      const from = line.from + start;
      const to = from + fullLen;
      const inner = match[1]!;
      const browserHref = wikiLinkInnerBrowserOpenableHref(inner);
      const innerClass =
        browserHref != null
          ? `cm-wiki-link cm-wiki-link--resolved cm-wiki-link--external ${CM_MD_EXTERNAL_LINK_GLYPH_CLASS}`
          : wikiResolved(inner)
            ? 'cm-wiki-link cm-wiki-link--resolved'
            : 'cm-wiki-link cm-wiki-link--unresolved';
      out.push({from, to: from + 2, priority: 2, classes: 'cm-md-wiki-bracket'});
      out.push({from: from + 2, to: to - 2, priority: 2, classes: innerClass});
      out.push({from: to - 2, to, priority: 2, classes: 'cm-md-wiki-bracket'});
      match = WIKI_LINK_LINE_RE.exec(text);
    }
  }
  return out;
}

function collectRelativeMdIntervals(
  state: EditorState,
  hrefIsResolved: (href: string) => boolean,
): StyledInterval[] {
  const tree = syntaxTree(state);
  const out: StyledInterval[] = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'URL') {
        return;
      }
      const parent = ref.node.parent;
      if (parent == null || parent.name !== 'Link') {
        return;
      }
      const href = state.sliceDoc(ref.from, ref.to);
      if (!isActivatableRelativeMarkdownHref(href)) {
        return;
      }
      const labelClass = hrefIsResolved(href)
        ? 'cm-md-rel-link cm-md-rel-link--resolved'
        : 'cm-md-rel-link cm-md-rel-link--unresolved';
      const hrefClass = `${labelClass} cm-md-rel-link-href`;
      out.push({from: ref.from, to: ref.to, priority: 2, classes: hrefClass});
      const labelSpan = relativeMarkdownLinkLabelSpan(parent, (a, b) =>
        state.sliceDoc(a, b),
      );
      if (labelSpan != null) {
        out.push({
          from: labelSpan.from,
          to: labelSpan.to,
          priority: 2,
          classes: labelClass,
        });
      }
    },
  });
  return out;
}

function collectExternalMdIntervals(state: EditorState): StyledInterval[] {
  const tree = syntaxTree(state);
  const out: StyledInterval[] = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'URL') {
        return;
      }
      const parent = ref.node.parent;
      if (parent == null || parent.name !== 'Link') {
        return;
      }
      const href = state.sliceDoc(ref.from, ref.to);
      if (!isBrowserOpenableMarkdownHref(href)) {
        return;
      }
      const labelClass = 'cm-md-external-link';
      const g = CM_MD_EXTERNAL_LINK_GLYPH_CLASS;
      const labelSpan = relativeMarkdownLinkLabelSpan(parent, (a, b) =>
        state.sliceDoc(a, b),
      );
      const hasVisibleLabel =
        labelSpan != null && labelSpan.to > labelSpan.from;
      const hrefClass = hasVisibleLabel
        ? `${labelClass} cm-md-external-href`
        : `${labelClass} cm-md-external-href ${g} ${CM_MD_EXTERNAL_BARE_URL_CLASS}`;
      out.push({from: ref.from, to: ref.to, priority: 2, classes: hrefClass});
      if (hasVisibleLabel && labelSpan != null) {
        out.push({
          from: labelSpan.from,
          to: labelSpan.to,
          priority: 2,
          classes: `${labelClass} ${g}`,
        });
      }
    },
  });
  return out;
}

/**
 * Re-emit `cm-md-equal-highlight` at priority 2 so it merges with link intervals instead of
 * being dropped by them. Lezer emits it at priority 0; `mergeStyledIntervals` only keeps the
 * highest-priority classes per position, so without this the highlight background disappears on
 * any text that is simultaneously inside a link label.
 */
function collectEqualHighlightIntervals(
  tree: ReturnType<typeof syntaxTree>,
  textLen: number,
): StyledInterval[] {
  const out: StyledInterval[] = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'EqualHighlight') {
        return;
      }
      const node = ref.node;
      let contentFrom = ref.from;
      let contentTo = ref.to;
      const first = node.firstChild;
      if (first?.name === 'EqualHighlightMark') contentFrom = first.to;
      const last = node.lastChild;
      if (last?.name === 'EqualHighlightMark') contentTo = last.from;
      const a = Math.max(0, contentFrom);
      const b = Math.min(textLen, contentTo);
      if (a < b) {
        out.push({from: a, to: b, priority: 2, classes: 'cm-md-equal-highlight'});
      }
    },
  });
  return out;
}

function collectBareBrowserStyledIntervals(state: EditorState): StyledInterval[] {
  const g = CM_MD_EXTERNAL_LINK_GLYPH_CLASS;
  const out: StyledInterval[] = [];
  for (const iv of collectBareBrowserUrlIntervals(state)) {
    out.push({
      from: iv.from,
      to: iv.to,
      priority: 2,
      classes: `cm-md-external-link ${g} ${CM_MD_EXTERNAL_BARE_URL_CLASS}`,
    });
  }
  return out;
}

export type CellStaticSegmentsResult = {
  state: EditorState;
  segments: CellStaticSegment[];
};

/**
 * Build disjoint styled segments for an inactive table cell using the same markdown parse +
 * class policy as nested CodeMirror (Lezer + wiki + relative-.md overlays).
 *
 * Returns the same `EditorState` used for highlighting so callers can reuse it for link hit-tests
 * (avoids a second Lezer parse per cell).
 */
export function buildCellStaticSegments(
  text: string,
  resolve: CellStaticResolvePredicates,
): CellStaticSegmentsResult {
  const textLen = text.length;
  const state = EditorState.create({
    doc: text,
    extensions: [
      markdownEskerra({
        base: commonmarkLanguage,
        extensions: noteMarkdownParserExtensions,
      }),
    ],
  });
  if (textLen === 0) {
    return {state, segments: []};
  }
  ensureSyntaxTree(state, textLen, TREE_ENSURE_MS);
  const tree = syntaxTree(state);
  const intervals: StyledInterval[] = [
    ...collectLezerIntervals(textLen, tree),
    ...collectEqualHighlightIntervals(tree, textLen),
    ...collectWikiIntervals(state.doc, resolve.wikiTargetIsResolved),
    ...collectRelativeMdIntervals(state, resolve.relativeMarkdownLinkHrefIsResolved),
    ...collectExternalMdIntervals(state),
    ...collectBareBrowserStyledIntervals(state),
  ];
  return {state, segments: mergeStyledIntervals(textLen, intervals)};
}

import {
  ensureSyntaxTree,
  matchBrackets,
  syntaxTree,
} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import {
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
  StateEffect,
  StateField,
  type SelectionRange,
} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

import {
  findSectionEnd,
  markdownHeadingLevel,
} from './markdownEskerraLanguage';
import {wikiLinkMatchAtDocPosition} from './wikiLinkInnerAtDocPosition';

export const SMART_EXPAND_USER_EVENT = 'eskerra.smartExpand.expand';
export const SMART_SHRINK_USER_EVENT = 'eskerra.smartExpand.shrink';

const SMART_EXPAND_STACK_CAP = 50;

export type SmartExpandStackEntry = {readonly anchor: number; readonly head: number};

const historyEffect = StateEffect.define<
  {kind: 'push'; entry: SmartExpandStackEntry} | {kind: 'pop'}
>();

export const smartExpandHistoryField = StateField.define<readonly SmartExpandStackEntry[]>({
  create: () => [],
  update(value, tr) {
    if (tr.docChanged) {
      return [];
    }
    const ours =
      tr.isUserEvent(SMART_EXPAND_USER_EVENT) || tr.isUserEvent(SMART_SHRINK_USER_EVENT);
    if (tr.selection && !ours) {
      return [];
    }
    let next = value;
    for (const e of tr.effects) {
      if (e.is(historyEffect)) {
        if (e.value.kind === 'push') {
          next = [...next, e.value.entry].slice(-SMART_EXPAND_STACK_CAP);
        } else {
          next = next.slice(0, -1);
        }
      }
    }
    return next;
  },
});

const OPAQUE_BLOCK_NAMES = new Set([
  'CodeBlock',
  'FencedCode',
  'IndentedCode',
  'ProcessingInstructionBlock',
  'CommentBlock',
]);

const SYNTAX_EXPAND_NAMES = new Set([
  'Link',
  'Image',
  'Emphasis',
  'StrongEmphasis',
  'Strikethrough',
  'InlineCode',
  'PercentMuted',
  'EqualHighlight',
]);

function inOpaqueBlock(state: EditorState, pos: number): boolean {
  ensureSyntaxTree(state, state.doc.length);
  let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; n; n = n.parent) {
    if (OPAQUE_BLOCK_NAMES.has(n.type.name)) {
      return true;
    }
  }
  return false;
}

/** True when the caret sits inside a code / opaque block (fenced code, etc.); skip HTML→Markdown paste there. */
export function markdownCaretInOpaquePasteBlock(
  state: EditorState,
  pos: number,
): boolean {
  return inOpaqueBlock(state, pos);
}

function strictlyWider(outer: SelectionRange, inner: SelectionRange): boolean {
  const ia = Math.min(inner.anchor, inner.head);
  const ib = Math.max(inner.anchor, inner.head);
  const oa = Math.min(outer.anchor, outer.head);
  const ob = Math.max(outer.anchor, outer.head);
  return oa <= ia && ob >= ib && (oa < ia || ob > ib);
}

/**
 * Like {@link strictlyWider}, but allows `outer.from` to sit after `inner.from` when the skipped
 * prefix is whitespace-only (leading indent before `ListMark` often lies outside the `ListItem` node).
 */
function strictlyWiderForListExpand(
  state: EditorState,
  outer: SelectionRange,
  inner: SelectionRange,
): boolean {
  if (strictlyWider(outer, inner)) {
    return true;
  }
  const ia = Math.min(inner.anchor, inner.head);
  const ib = Math.max(inner.anchor, inner.head);
  const oa = Math.min(outer.anchor, outer.head);
  const ob = Math.max(outer.anchor, outer.head);
  if (oa > ia && oa <= ib && ob > ib) {
    const gap = state.sliceDoc(ia, oa);
    if (gap.length > 0 && /^\s+$/.test(gap)) {
      return true;
    }
  }
  return false;
}

function asRange(from: number, to: number): SelectionRange {
  return EditorSelection.range(from, to);
}

function findAncestorNamed(
  state: EditorState,
  pos: number,
  name: string,
): SyntaxNode | null {
  ensureSyntaxTree(state, state.doc.length);
  let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; n; n = n.parent) {
    if (n.type.name === name) {
      return n;
    }
  }
  return null;
}

/** US English–centric: segments at `.?!` + optional quotes + whitespace, and at newlines. */
function sentenceSlicesInParagraph(text: string): readonly {from: number; to: number}[] {
  const slices: {from: number; to: number}[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      if (i > start) {
        slices.push({from: start, to: i});
      }
      start = i + 1;
      continue;
    }
    if (text[i] === '.' || text[i] === '!' || text[i] === '?') {
      let j = i + 1;
      while (j < text.length && (text[j] === '"' || text[j] === "'")) {
        j++;
      }
      if (j >= text.length || /\s/.test(text[j])) {
        slices.push({from: start, to: j});
        while (j < text.length && /\s/.test(text[j])) {
          j++;
        }
        start = j;
        i = Math.max(i, start - 1);
      }
    }
  }
  if (start < text.length) {
    slices.push({from: start, to: text.length});
  }
  return slices.length > 0 ? slices : [{from: 0, to: text.length}];
}

function sentenceSliceContainingParagraphOffset(
  text: string,
  relHead: number,
): {from: number; to: number} {
  const slices = sentenceSlicesInParagraph(text);
  for (const s of slices) {
    if (relHead >= s.from && relHead < s.to) {
      return s;
    }
  }
  return slices[slices.length - 1] ?? {from: 0, to: text.length};
}

/** Length of ordered `1. ` / `1) ` or bullet `- ` prefix on the first line only (paragraph-local offsets). */
function listMarkerTrimOffsetInParagraph(text: string): number {
  const lineEnd = text.indexOf('\n');
  const firstLine = lineEnd < 0 ? text : text.slice(0, lineEnd);
  const m = firstLine.match(/^(\s*)(?:(?:\d{1,9}[.)]\s+)|(?:[-*+]\s+))/);
  return m ? m[0].length : 0;
}

function trimSentenceSliceForListMarker(
  slice: {from: number; to: number},
  trim: number,
): {from: number; to: number} {
  return {from: Math.max(slice.from, trim), to: slice.to};
}

let graphemeSegmenterMemo: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | undefined {
  if (graphemeSegmenterMemo === null) {
    return undefined;
  }
  if (graphemeSegmenterMemo) {
    return graphemeSegmenterMemo;
  }
  try {
    graphemeSegmenterMemo = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  } catch {
    graphemeSegmenterMemo = null;
  }
  return graphemeSegmenterMemo ?? undefined;
}

/** True when a grapheme cluster is treated as an emoji for smart-expand (flags, pictographics). */
function graphemeLooksLikeEmoji(segment: string): boolean {
  if (!segment) {
    return false;
  }
  if (/\p{Extended_Pictographic}/u.test(segment)) {
    return true;
  }
  const ri = segment.match(/\p{Regional_Indicator}/gu);
  return !!ri && ri.length >= 2;
}

/**
 * When the caret is collapsed and touches an emoji grapheme (immediately before or after it),
 * first expand selects exactly that emoji (before word / bracket / … expansion).
 *
 * If the caret sits between two emojis with no separator, the emoji **to the right** wins.
 */
function candidateEmojiAdjacentToCursor(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  if (!main.empty) {
    return null;
  }
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const pos = main.head;
  const segIntl = getGraphemeSegmenter();
  if (!segIntl) {
    return null;
  }
  const docLen = state.doc.length;

  // Caret immediately *before* an emoji: select the grapheme starting at `pos`.
  if (pos < docLen) {
    const winEnd = Math.min(docLen, pos + 256);
    const forward = state.sliceDoc(pos, winEnd);
    if (forward.length > 0) {
      for (const {segment, index} of segIntl.segment(forward)) {
        if (index !== 0) {
          break;
        }
        if (graphemeLooksLikeEmoji(segment)) {
          const r = asRange(pos, pos + segment.length);
          if (strictlyWider(r, main)) {
            return r;
          }
        }
        break;
      }
    }
  }

  // Caret immediately *after* an emoji: select the grapheme ending at `pos`.
  if (pos <= 0) {
    return null;
  }
  const winStart = Math.max(0, pos - 256);
  const backward = state.sliceDoc(winStart, pos);
  if (backward.length === 0) {
    return null;
  }
  let lastFromRel = -1;
  let lastSeg = '';
  for (const {segment, index} of segIntl.segment(backward)) {
    if (index + segment.length === backward.length) {
      lastFromRel = index;
      lastSeg = segment;
      break;
    }
  }
  if (lastFromRel < 0 || !graphemeLooksLikeEmoji(lastSeg)) {
    return null;
  }
  const from = winStart + lastFromRel;
  const r = asRange(from, pos);
  return strictlyWider(r, main) ? r : null;
}

function candidateWord(state: EditorState, main: SelectionRange): SelectionRange | null {
  const w = state.wordAt(main.head);
  if (!w || w.from >= w.to) {
    return null;
  }
  if (!strictlyWider(w, main)) {
    return null;
  }
  return w;
}

/** Comma/semicolon/newline-delimited span within [sliceStart, sliceEnd) (paragraph-local offsets). */
function computeClauseInTextSlice(
  text: string,
  rel: number,
  sliceStart: number,
  sliceEnd: number,
): {left: number; right: number} | null {
  if (sliceStart >= sliceEnd || rel < 0 || rel > text.length) {
    return null;
  }
  const relClamped = Math.min(Math.max(rel, sliceStart), sliceEnd - 1);
  let left = sliceStart;
  let right = sliceEnd;
  for (let i = relClamped - 1; i >= sliceStart; i--) {
    const c = text[i];
    if (c === ',' || c === ';') {
      left = i + 1;
      break;
    }
    if (c === '\n') {
      left = i + 1;
      break;
    }
  }
  for (let i = relClamped; i < sliceEnd; i++) {
    const c = text[i];
    if (c === ',' || c === ';') {
      right = i;
      break;
    }
    if (c === '\n') {
      right = i;
      break;
    }
  }
  while (left < right && /\s/.test(text[left])) {
    left++;
  }
  while (right > left && /\s/.test(text[right - 1])) {
    right--;
  }
  if (left >= right) {
    return null;
  }
  return {left, right};
}

function candidateClause(state: EditorState, main: SelectionRange): SelectionRange | null {
  const focus = Math.min(main.anchor, main.head);
  const para = findAncestorNamed(state, focus, 'Paragraph');
  if (!para || inOpaqueBlock(state, focus)) {
    return null;
  }
  const text = state.sliceDoc(para.from, para.to);
  const rel = focus - para.from;
  if (rel < 0 || rel > text.length) {
    return null;
  }

  const ia = Math.min(main.anchor, main.head);
  const ib = Math.max(main.anchor, main.head);

  let sliceStart = 0;
  let sliceEnd = text.length;

  if (!wikiLinkMatchAtDocPosition(state.doc, focus)) {
    const m = tryMatchBracketsForClauseSlice(state, main);
    if (m?.matched && m.end) {
      if (ia <= m.start.from && ib >= m.end.to) {
        // Selection already spans the full matched pair; defer to sentence / larger steps.
        return null;
      }
      if (ia >= m.start.to && ib <= m.end.from) {
        const innerFrom = m.start.to - para.from;
        const innerTo = m.end.from - para.from;
        sliceStart = Math.max(0, innerFrom);
        sliceEnd = Math.min(text.length, innerTo);
      }
    }
  }

  const window = computeClauseInTextSlice(text, rel, sliceStart, sliceEnd);
  if (!window) {
    return null;
  }
  const r = asRange(para.from + window.left, para.from + window.right);
  return strictlyWider(r, main) ? r : null;
}

type ParenPairMatch = NonNullable<ReturnType<typeof matchBrackets>>;

/**
 * When Lezer token types differ inside prose, {@link matchBrackets} often yields null. Scan plain `(` `)`
 * within the current paragraph so smart expand still respects parentheses (see plan: v1 text scan).
 */
function matchRoundParensTextFallback(
  state: EditorState,
  docPos: number,
): {start: {from: number; to: number}; end: {from: number; to: number}} | null {
  if (inOpaqueBlock(state, docPos)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, docPos)) {
    return null;
  }
  const para = findAncestorNamed(state, docPos, 'Paragraph');
  if (!para) {
    return null;
  }
  const base = para.from;
  const text = state.sliceDoc(para.from, para.to);
  const rel = docPos - base;
  if (rel < 0 || rel >= text.length) {
    return null;
  }
  let depth = 0;
  let openRel = -1;
  for (let i = rel; i >= 0; i--) {
    const ch = text[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        openRel = i;
        break;
      }
      depth--;
    }
  }
  if (openRel < 0) {
    return null;
  }
  depth = 0;
  let closeRel = -1;
  for (let i = openRel + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      if (depth === 0) {
        closeRel = i;
        break;
      }
      depth--;
    }
  }
  if (closeRel < 0 || rel < openRel || rel > closeRel) {
    return null;
  }
  return {
    start: {from: base + openRel, to: base + openRel + 1},
    end: {from: base + closeRel, to: base + closeRel + 1},
  };
}

/**
 * Plain `{` `}` scan in the current paragraph (same spirit as {@link matchRoundParensTextFallback}).
 */
function matchCurlyBracesTextFallback(
  state: EditorState,
  docPos: number,
): {start: {from: number; to: number}; end: {from: number; to: number}} | null {
  if (inOpaqueBlock(state, docPos)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, docPos)) {
    return null;
  }
  const para = findAncestorNamed(state, docPos, 'Paragraph');
  if (!para) {
    return null;
  }
  const base = para.from;
  const text = state.sliceDoc(para.from, para.to);
  const rel = docPos - base;
  if (rel < 0 || rel >= text.length) {
    return null;
  }
  let depth = 0;
  let openRel = -1;
  for (let i = rel; i >= 0; i--) {
    const ch = text[i];
    if (ch === '}') {
      depth++;
    } else if (ch === '{') {
      if (depth === 0) {
        openRel = i;
        break;
      }
      depth--;
    }
  }
  if (openRel < 0) {
    return null;
  }
  depth = 0;
  let closeRel = -1;
  for (let i = openRel + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      if (depth === 0) {
        closeRel = i;
        break;
      }
      depth--;
    }
  }
  if (closeRel < 0 || rel < openRel || rel > closeRel) {
    return null;
  }
  return {
    start: {from: base + openRel, to: base + openRel + 1},
    end: {from: base + closeRel, to: base + closeRel + 1},
  };
}

function parenPairFromFallback(
  fb: {start: {from: number; to: number}; end: {from: number; to: number}},
): ParenPairMatch {
  return {matched: true, start: fb.start, end: fb.end};
}

function posStrictlyInsidePair(m: ParenPairMatch, docPos: number): boolean {
  return Boolean(m.end && m.matched && docPos >= m.start.to && docPos < m.end.from);
}

function pairOuterWidth(m: ParenPairMatch): number {
  return m.end!.to - m.start.from;
}

function pairsAreSameOuter(a: ParenPairMatch, b: ParenPairMatch): boolean {
  return a.start.from === b.start.from && a.end!.to === b.end!.to;
}

/** Narrowest outer span wins so `({a})` expands `a` → `{a}` → `({a})` instead of skipping the brace pair. */
function tryParenPairForSmartExpand(state: EditorState, docPos: number): ParenPairMatch | null {
  const candidates: ParenPairMatch[] = [];
  const cm = matchBrackets(state, docPos, 1) ?? matchBrackets(state, docPos, -1);
  if (cm?.matched && cm.end && posStrictlyInsidePair(cm, docPos)) {
    candidates.push(cm);
  }
  const roundFb = matchRoundParensTextFallback(state, docPos);
  if (roundFb) {
    const m = parenPairFromFallback(roundFb);
    if (
      posStrictlyInsidePair(m, docPos)
      && !candidates.some(c => pairsAreSameOuter(c, m))
    ) {
      candidates.push(m);
    }
  }
  const curlyFb = matchCurlyBracesTextFallback(state, docPos);
  if (curlyFb) {
    const m = parenPairFromFallback(curlyFb);
    if (
      posStrictlyInsidePair(m, docPos)
      && !candidates.some(c => pairsAreSameOuter(c, m))
    ) {
      candidates.push(m);
    }
  }
  if (!candidates.length) {
    return null;
  }
  let best = candidates[0];
  let bestW = pairOuterWidth(best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const w = pairOuterWidth(c);
    if (w < bestW) {
      best = c;
      bestW = w;
    }
  }
  return best;
}

/**
 * Conservative ASCII `"`…`"` pair in the paragraph: inner may not contain `"`; picks the narrowest span that
 * strictly contains `docPos`.
 */
function matchAsciiDoubleQuoteTextFallback(
  state: EditorState,
  docPos: number,
): {start: {from: number; to: number}; end: {from: number; to: number}} | null {
  if (inOpaqueBlock(state, docPos)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, docPos)) {
    return null;
  }
  const para = findAncestorNamed(state, docPos, 'Paragraph');
  if (!para) {
    return null;
  }
  const base = para.from;
  const text = state.sliceDoc(para.from, para.to);
  const rel = docPos - base;
  if (rel < 0 || rel >= text.length) {
    return null;
  }
  let bestOpen = -1;
  let bestClose = -1;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (let i = rel; i >= 0; i--) {
    if (text[i] !== '"') {
      continue;
    }
    let j = i + 1;
    while (j < text.length && text[j] !== '"') {
      j++;
    }
    if (j >= text.length) {
      continue;
    }
    if (rel <= i || rel >= j) {
      continue;
    }
    const span = j - i + 1;
    if (span < bestSpan) {
      bestSpan = span;
      bestOpen = i;
      bestClose = j;
    }
  }
  if (bestOpen < 0) {
    return null;
  }
  return {
    start: {from: base + bestOpen, to: base + bestOpen + 1},
    end: {from: base + bestClose, to: base + bestClose + 1},
  };
}

function tryAsciiDoubleQuotePairForSmartExpand(
  state: EditorState,
  docPos: number,
): ParenPairMatch | null {
  const fb = matchAsciiDoubleQuoteTextFallback(state, docPos);
  return fb ? parenPairFromFallback(fb) : null;
}

function tryMatchAsciiDoubleQuotesForExpand(state: EditorState, main: SelectionRange): ParenPairMatch | null {
  const lo = Math.min(main.anchor, main.head);
  const hi = Math.max(main.anchor, main.head);
  return (
    tryAsciiDoubleQuotePairForSmartExpand(state, lo) ??
    (hi > lo ? tryAsciiDoubleQuotePairForSmartExpand(state, hi - 1) : null) ??
    tryAsciiDoubleQuotePairForSmartExpand(state, hi)
  );
}

/**
 * Bracket pair for clause bounding (includes caret on `(` / `)` so comma-after-`);` probes do not
 * see a pair). Not innermost: first hit among CM, then round, then curly fallback.
 */
function trySingleProbeBracketPairForClause(state: EditorState, docPos: number): ParenPairMatch | null {
  const cm = matchBrackets(state, docPos, 1) ?? matchBrackets(state, docPos, -1);
  if (cm?.matched && cm.end) {
    return cm;
  }
  const roundFb = matchRoundParensTextFallback(state, docPos);
  if (roundFb) {
    return parenPairFromFallback(roundFb);
  }
  const curlyFb = matchCurlyBracesTextFallback(state, docPos);
  return curlyFb ? parenPairFromFallback(curlyFb) : null;
}

function tryMatchBracketsForClauseSlice(state: EditorState, main: SelectionRange): ParenPairMatch | null {
  const lo = Math.min(main.anchor, main.head);
  const hi = Math.max(main.anchor, main.head);
  return (
    trySingleProbeBracketPairForClause(state, lo) ??
    (hi > lo ? trySingleProbeBracketPairForClause(state, hi - 1) : null) ??
    trySingleProbeBracketPairForClause(state, hi)
  );
}

function candidateAsciiDoubleQuoteInner(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  const focus = Math.min(main.anchor, main.head);
  if (inOpaqueBlock(state, focus)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, focus)) {
    return null;
  }
  const m = tryMatchAsciiDoubleQuotesForExpand(state, main);
  if (!m?.matched || !m.end) {
    return null;
  }
  const inner = asRange(m.start.to, m.end.from);
  return strictlyWider(inner, main) ? inner : null;
}

function candidateAsciiDoubleQuoteOuter(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  const focus = Math.min(main.anchor, main.head);
  if (inOpaqueBlock(state, focus)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, focus)) {
    return null;
  }
  const m = tryMatchAsciiDoubleQuotesForExpand(state, main);
  if (!m?.matched || !m.end) {
    return null;
  }
  const outer = asRange(m.start.from, m.end.to);
  return strictlyWider(outer, main) ? outer : null;
}

/** Prefer the selection start and the last in-range char before `)` so probe is never stuck on a closer. */
function tryMatchBracketsForExpand(state: EditorState, main: SelectionRange): ParenPairMatch | null {
  const lo = Math.min(main.anchor, main.head);
  const hi = Math.max(main.anchor, main.head);
  return (
    tryParenPairForSmartExpand(state, lo) ??
    (hi > lo ? tryParenPairForSmartExpand(state, hi - 1) : null) ??
    tryParenPairForSmartExpand(state, hi)
  );
}

function candidateBracketInner(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  const focus = Math.min(main.anchor, main.head);
  if (inOpaqueBlock(state, focus)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, focus)) {
    return null;
  }
  const m = tryMatchBracketsForExpand(state, main);
  if (!m?.matched || !m.end) {
    return null;
  }
  const inner = asRange(m.start.to, m.end.from);
  return strictlyWider(inner, main) ? inner : null;
}

function candidateBracketOuter(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  const focus = Math.min(main.anchor, main.head);
  if (inOpaqueBlock(state, focus)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, focus)) {
    return null;
  }
  const m = tryMatchBracketsForExpand(state, main);
  if (!m?.matched || !m.end) {
    return null;
  }
  const outer = asRange(m.start.from, m.end.to);
  return strictlyWider(outer, main) ? outer : null;
}

function candidateWikiInner(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  const match = wikiLinkMatchAtDocPosition(state.doc, main.head);
  if (!match) {
    return null;
  }
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const inner = asRange(match.innerFrom, match.innerTo);
  return strictlyWider(inner, main) ? inner : null;
}

function candidateWikiFull(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  const match = wikiLinkMatchAtDocPosition(state.doc, main.head);
  if (!match) {
    return null;
  }
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const line = state.doc.lineAt(main.head);
  const lineText = line.text;
  const column = main.head - line.from;
  let found: {start: number; end: number} | null = null;
  const re = /\[\[([^[\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText))) {
    const s = m.index;
    const e = s + m[0].length;
    if (column >= s && column < e) {
      found = {start: line.from + s, end: line.from + e};
      break;
    }
  }
  if (!found) {
    return null;
  }
  const full = asRange(found.start, found.end);
  return strictlyWider(full, main) ? full : null;
}

function candidateSyntaxInner(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  ensureSyntaxTree(state, state.doc.length);
  let n: SyntaxNode | null = syntaxTree(state).resolveInner(main.head, -1);
  for (; n; n = n.parent) {
    if (n.type.isTop) {
      break;
    }
    const name = n.type.name;
    if (!SYNTAX_EXPAND_NAMES.has(name)) {
      continue;
    }
    const r = asRange(n.from, n.to);
    if (strictlyWider(r, main)) {
      return r;
    }
  }
  return null;
}

/**
 * Sentence slice up to (but not including) terminal `.` `!` `?` when that punct ends the segment
 * (same heuristic as {@link sentenceSlicesInParagraph}). Skips when body would equal full slice.
 */
function candidateSentenceBody(state: EditorState, main: SelectionRange): SelectionRange | null {
  const para = findAncestorNamed(state, main.head, 'Paragraph');
  if (!para || inOpaqueBlock(state, main.head)) {
    return null;
  }
  const text = state.sliceDoc(para.from, para.to);
  const rel = main.head - para.from;
  const trim = listMarkerTrimOffsetInParagraph(text);
  const {from, to} = trimSentenceSliceForListMarker(
    sentenceSliceContainingParagraphOffset(text, rel),
    trim,
  );
  if (from >= to) {
    return null;
  }
  let i = to - 1;
  while (i > from && /\s/.test(text[i])) {
    i--;
  }
  if (i <= from) {
    return null;
  }
  while (i > from && (text[i] === '"' || text[i] === "'")) {
    i--;
  }
  if (i <= from || !'.!?'.includes(text[i])) {
    return null;
  }
  let bodyRight = i;
  while (bodyRight > from && /\s/.test(text[bodyRight - 1])) {
    bodyRight--;
  }
  if (bodyRight <= from) {
    return null;
  }
  const r = asRange(para.from + from, para.from + bodyRight);
  return strictlyWider(r, main) ? r : null;
}

function candidateSentenceFull(state: EditorState, main: SelectionRange): SelectionRange | null {
  const para = findAncestorNamed(state, main.head, 'Paragraph');
  if (!para || inOpaqueBlock(state, main.head)) {
    return null;
  }
  const text = state.sliceDoc(para.from, para.to);
  const rel = main.head - para.from;
  const trim = listMarkerTrimOffsetInParagraph(text);
  const {from, to} = trimSentenceSliceForListMarker(
    sentenceSliceContainingParagraphOffset(text, rel),
    trim,
  );
  if (from >= to) {
    return null;
  }
  const r = asRange(para.from + from, para.from + to);
  return strictlyWider(r, main) ? r : null;
}

const LIST_CONTAINER_NAMES = new Set(['BulletList', 'OrderedList']);

function isListContainerName(name: string): boolean {
  return LIST_CONTAINER_NAMES.has(name);
}

function parentListOfListItem(item: SyntaxNode): SyntaxNode | null {
  const p = item.parent;
  return p && isListContainerName(p.type.name) ? p : null;
}

function parentListItemOfList(list: SyntaxNode): SyntaxNode | null {
  const p = list.parent;
  return p?.type.name === 'ListItem' ? p : null;
}

/** Union span of direct `ListItem` children of a list container. */
function unionDirectListItemRange(list: SyntaxNode): SelectionRange | null {
  let from = -1;
  let to = -1;
  let c = list.firstChild;
  while (c) {
    if (c.type.name === 'ListItem') {
      if (from < 0) {
        from = c.from;
        to = c.to;
      } else {
        from = Math.min(from, c.from);
        to = Math.max(to, c.to);
      }
    }
    c = c.nextSibling;
  }
  return from >= 0 ? asRange(from, to) : null;
}

/** Outermost `BulletList` / `OrderedList` ancestor of this list item (same contiguous list tree). */
function outermostListForListItem(startItem: SyntaxNode): SyntaxNode | null {
  let list = parentListOfListItem(startItem);
  if (!list) {
    return null;
  }
  for (;;) {
    const pItem = parentListItemOfList(list);
    if (!pItem) {
      return list;
    }
    const outer = parentListOfListItem(pItem);
    if (!outer) {
      return list;
    }
    list = outer;
  }
}

function selectionBounds(main: SelectionRange): {readonly ma: number; readonly mb: number} {
  return {
    ma: Math.min(main.anchor, main.head),
    mb: Math.max(main.anchor, main.head),
  };
}

function rangesEqualDocBounds(main: SelectionRange, from: number, to: number): boolean {
  const {ma, mb} = selectionBounds(main);
  return ma === from && mb === to;
}

function candidateLines(state: EditorState, main: SelectionRange): SelectionRange | null {
  const a = Math.min(main.anchor, main.head);
  const b = Math.max(main.anchor, main.head);
  const startLine = state.doc.lineAt(a);
  const endLine = state.doc.lineAt(b);
  const r = asRange(startLine.from, endLine.to);
  if (!strictlyWider(r, main)) {
    return null;
  }
  const {ma, mb} = selectionBounds(main);
  if (r.from < ma && /^\s+$/.test(state.sliceDoc(r.from, ma))) {
    const item = findAncestorNamed(state, main.head, 'ListItem');
    const list = item && parentListOfListItem(item);
    const u = list && unionDirectListItemRange(list);
    if (u && ma === u.from && mb === u.to) {
      return null;
    }
  }
  return r;
}

function candidateParagraph(state: EditorState, main: SelectionRange): SelectionRange | null {
  const para = findAncestorNamed(state, main.head, 'Paragraph');
  if (!para || inOpaqueBlock(state, main.head)) {
    return null;
  }
  const r = asRange(para.from, para.to);
  return strictlyWider(r, main) ? r : null;
}

function candidateListItem(state: EditorState, main: SelectionRange): SelectionRange | null {
  const item = findAncestorNamed(state, main.head, 'ListItem');
  if (!item || inOpaqueBlock(state, main.head)) {
    return null;
  }
  const r = asRange(item.from, item.to);
  return strictlyWiderForListExpand(state, r, main) ? r : null;
}

function candidateListSiblingGroup(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const item = findAncestorNamed(state, main.head, 'ListItem');
  if (!item) {
    return null;
  }
  const list = parentListOfListItem(item);
  if (!list) {
    return null;
  }
  const u = unionDirectListItemRange(list);
  if (!u) {
    return null;
  }
  return strictlyWiderForListExpand(state, u, main) ? u : null;
}

/**
 * After the sibling group at a level, expand to parent `ListItem`, then to that level's sibling
 * group, repeating up the nested list chain (one ring per keypress).
 */
function candidateListNestAscend(state: EditorState, main: SelectionRange): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  let item: SyntaxNode | null = findAncestorNamed(state, main.head, 'ListItem');
  while (item) {
    const list = parentListOfListItem(item);
    if (!list) {
      return null;
    }
    const sibs = unionDirectListItemRange(list);
    if (!sibs) {
      return null;
    }
    const pItem = parentListItemOfList(list);

    if (
      pItem &&
      rangesEqualDocBounds(main, sibs.from, sibs.to) &&
      strictlyWiderForListExpand(state, asRange(pItem.from, pItem.to), main)
    ) {
      return asRange(pItem.from, pItem.to);
    }
    if (pItem && rangesEqualDocBounds(main, pItem.from, pItem.to)) {
      const gList = parentListOfListItem(pItem);
      if (gList) {
        const gSibs = unionDirectListItemRange(gList);
        if (gSibs && strictlyWiderForListExpand(state, gSibs, main)) {
          return gSibs;
        }
      }
    }
    item = pItem;
  }
  return null;
}

function candidateOutermostList(state: EditorState, main: SelectionRange): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const item = findAncestorNamed(state, main.head, 'ListItem');
  if (!item) {
    return null;
  }
  const outer = outermostListForListItem(item);
  if (!outer) {
    return null;
  }
  const r = asRange(outer.from, outer.to);
  return strictlyWiderForListExpand(state, r, main) ? r : null;
}

/**
 * Deepest heading (H1–H6) whose section [heading.from, {@link findSectionEnd}) fully contains the
 * current selection. Uses full range so a large selection (e.g. entire subsection body) still
 * resolves to the enclosing outline node, not a nested heading that only contains the caret.
 */
function innermostHeadingWhoseSectionContainsSelection(
  state: EditorState,
  main: SelectionRange,
): SyntaxNode | null {
  const selA = Math.min(main.anchor, main.head);
  const selB = Math.max(main.anchor, main.head);
  ensureSyntaxTree(state, state.doc.length);
  let best: SyntaxNode | null = null;
  let bestFrom = -1;
  syntaxTree(state).iterate({
    enter(ref) {
      const L = markdownHeadingLevel(ref.type.name);
      if (L == null) {
        return;
      }
      const header = ref.node;
      const end = findSectionEnd(header, L);
      if (selA < ref.from || selB > end) {
        return;
      }
      if (ref.from > bestFrom) {
        bestFrom = ref.from;
        best = header;
      }
    },
  });
  return best;
}

/** Nearest heading before `child` with a strictly lower level number (outline parent). */
function findParentSectionHeading(
  state: EditorState,
  child: SyntaxNode,
  childLevel: number,
): SyntaxNode | null {
  ensureSyntaxTree(state, state.doc.length);
  let best: SyntaxNode | null = null;
  let bestFrom = -1;
  syntaxTree(state).iterate({
    enter(ref) {
      const node = ref.node;
      const L = markdownHeadingLevel(node.type.name);
      if (L == null || L >= childLevel || node.from >= child.from) {
        return;
      }
      if (node.from > bestFrom) {
        bestFrom = node.from;
        best = node;
      }
    },
  });
  return best;
}

function candidateSectionBody(state: EditorState, main: SelectionRange): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const H = innermostHeadingWhoseSectionContainsSelection(state, main);
  if (!H) {
    return null;
  }
  const L = markdownHeadingLevel(H.type.name)!;
  const end = findSectionEnd(H, L);
  const r = asRange(H.to, end);
  return strictlyWider(r, main) ? r : null;
}

function candidateSectionWithHeading(state: EditorState, main: SelectionRange): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const H = innermostHeadingWhoseSectionContainsSelection(state, main);
  if (!H) {
    return null;
  }
  const L = markdownHeadingLevel(H.type.name)!;
  const end = findSectionEnd(H, L);
  const r = asRange(H.from, end);
  return strictlyWider(r, main) ? r : null;
}

function candidateParentSectionBody(state: EditorState, main: SelectionRange): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const H = innermostHeadingWhoseSectionContainsSelection(state, main);
  if (!H) {
    return null;
  }
  const childLevel = markdownHeadingLevel(H.type.name)!;
  const P = findParentSectionHeading(state, H, childLevel);
  if (!P) {
    return null;
  }
  const Lp = markdownHeadingLevel(P.type.name)!;
  const end = findSectionEnd(P, Lp);
  const r = asRange(P.to, end);
  return strictlyWider(r, main) ? r : null;
}

function candidateParentSectionWithHeading(state: EditorState, main: SelectionRange): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  const H = innermostHeadingWhoseSectionContainsSelection(state, main);
  if (!H) {
    return null;
  }
  const childLevel = markdownHeadingLevel(H.type.name)!;
  const P = findParentSectionHeading(state, H, childLevel);
  if (!P) {
    return null;
  }
  const Lp = markdownHeadingLevel(P.type.name)!;
  const end = findSectionEnd(P, Lp);
  const r = asRange(P.from, end);
  return strictlyWider(r, main) ? r : null;
}

function candidateDocument(state: EditorState, main: SelectionRange): SelectionRange | null {
  const r = asRange(0, state.doc.length);
  return strictlyWider(r, main) ? r : null;
}

function computeNextExpandRange(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  ensureSyntaxTree(state, state.doc.length);
  const steps: ((s: EditorState, m: SelectionRange) => SelectionRange | null)[] = [
    candidateEmojiAdjacentToCursor,
    candidateWord,
    candidateBracketInner,
    candidateBracketOuter,
    candidateAsciiDoubleQuoteInner,
    candidateAsciiDoubleQuoteOuter,
    candidateWikiInner,
    candidateWikiFull,
    candidateClause,
    candidateSentenceBody,
    candidateSentenceFull,
    candidateSyntaxInner,
    candidateLines,
    candidateListItem,
    candidateListSiblingGroup,
    candidateListNestAscend,
    candidateOutermostList,
    candidateParagraph,
    candidateSectionBody,
    candidateSectionWithHeading,
    candidateParentSectionBody,
    candidateParentSectionWithHeading,
    candidateDocument,
  ];
  for (const step of steps) {
    const r = step(state, main);
    if (r && !r.eq(main)) {
      return r;
    }
  }
  return null;
}

function runSmartExpand(view: EditorView): boolean {
  const state = view.state;
  ensureSyntaxTree(state, state.doc.length);
  const main = state.selection.main;
  const next = computeNextExpandRange(state, main);
  if (!next) {
    return false;
  }
  view.dispatch({
    selection: EditorSelection.create([next]),
    effects: historyEffect.of({
      kind: 'push',
      entry: {anchor: main.anchor, head: main.head},
    }),
    userEvent: SMART_EXPAND_USER_EVENT,
    scrollIntoView: true,
  });
  return true;
}

function runSmartShrink(view: EditorView): boolean {
  const stack = view.state.field(smartExpandHistoryField);
  if (stack.length === 0) {
    return false;
  }
  const entry = stack[stack.length - 1];
  const selection =
    entry.anchor === entry.head
      ? EditorSelection.cursor(entry.head)
      : EditorSelection.single(entry.anchor, entry.head);
  view.dispatch({
    selection,
    effects: historyEffect.of({kind: 'pop'}),
    userEvent: SMART_SHRINK_USER_EVENT,
    scrollIntoView: true,
  });
  return true;
}

/**
 * DOM handler so Ctrl/Cmd+W does not steal Shift+W: CodeMirror's char-keymap path drops Shift from
 * the lookup key for letter chords, so Shift-Ctrl-W would otherwise run expand.
 */
const smartExpandKeydown = EditorView.domEventHandlers({
  keydown(event, view) {
    if (event.key !== 'w' && event.key !== 'W') {
      return false;
    }
    if (!event.ctrlKey && !event.metaKey) {
      return false;
    }
    if (event.shiftKey) {
      if (runSmartShrink(view)) {
        event.preventDefault();
        return true;
      }
      return false;
    }
    if (runSmartExpand(view)) {
      event.preventDefault();
      return true;
    }
    return false;
  },
});

/** Prec.highest handler + history field for IDE-style selection expand/shrink. */
export function markdownSmartExpandExtension(): readonly Extension[] {
  return [smartExpandHistoryField, Prec.highest(smartExpandKeydown)];
}

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
} from './markdownNoteboxLanguage';
import {wikiLinkMatchAtDocPosition} from './wikiLinkInnerAtDocPosition';

export const SMART_EXPAND_USER_EVENT = 'notebox.smartExpand.expand';
export const SMART_SHRINK_USER_EVENT = 'notebox.smartExpand.shrink';

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

function strictlyWider(outer: SelectionRange, inner: SelectionRange): boolean {
  const ia = Math.min(inner.anchor, inner.head);
  const ib = Math.max(inner.anchor, inner.head);
  const oa = Math.min(outer.anchor, outer.head);
  const ob = Math.max(outer.anchor, outer.head);
  return oa <= ia && ob >= ib && (oa < ia || ob > ib);
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
    const m = tryMatchBracketsForExpand(state, main);
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

function tryParenPairForSmartExpand(state: EditorState, docPos: number): ParenPairMatch | null {
  const cm = matchBrackets(state, docPos, 1) ?? matchBrackets(state, docPos, -1);
  if (cm?.matched && cm.end) {
    return cm;
  }
  const fb = matchRoundParensTextFallback(state, docPos);
  if (fb) {
    return {matched: true, start: fb.start, end: fb.end};
  }
  return null;
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
  const {from, to} = sentenceSliceContainingParagraphOffset(text, rel);
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
  const {from, to} = sentenceSliceContainingParagraphOffset(text, rel);
  if (from >= to) {
    return null;
  }
  const r = asRange(para.from + from, para.from + to);
  return strictlyWider(r, main) ? r : null;
}

function candidateLines(state: EditorState, main: SelectionRange): SelectionRange | null {
  const a = Math.min(main.anchor, main.head);
  const b = Math.max(main.anchor, main.head);
  const startLine = state.doc.lineAt(a);
  const endLine = state.doc.lineAt(b);
  const r = asRange(startLine.from, endLine.to);
  return strictlyWider(r, main) ? r : null;
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
  return strictlyWider(r, main) ? r : null;
}

function candidateSection(state: EditorState, main: SelectionRange): SelectionRange | null {
  ensureSyntaxTree(state, state.doc.length);
  let n: SyntaxNode | null = syntaxTree(state).resolveInner(main.head, -1);
  for (; n; n = n.parent) {
    const level = markdownHeadingLevel(n.type.name);
    if (level == null) {
      continue;
    }
    if (level <= 1) {
      continue;
    }
    const end = findSectionEnd(n, level);
    const r = asRange(n.from, end);
    if (strictlyWider(r, main)) {
      return r;
    }
  }
  return null;
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
    candidateWord,
    candidateBracketInner,
    candidateBracketOuter,
    candidateWikiInner,
    candidateWikiFull,
    candidateClause,
    candidateSyntaxInner,
    candidateSentenceBody,
    candidateSentenceFull,
    candidateLines,
    candidateParagraph,
    candidateListItem,
    candidateSection,
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

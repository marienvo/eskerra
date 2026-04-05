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

function candidateClause(state: EditorState, main: SelectionRange): SelectionRange | null {
  const para = findAncestorNamed(state, main.head, 'Paragraph');
  if (!para || inOpaqueBlock(state, main.head)) {
    return null;
  }
  const text = state.sliceDoc(para.from, para.to);
  const rel = main.head - para.from;
  if (rel < 0 || rel > text.length) {
    return null;
  }
  let left = 0;
  let right = text.length;
  for (let i = rel - 1; i >= 0; i--) {
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
  for (let i = rel; i < text.length; i++) {
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
  const r = asRange(para.from + left, para.from + right);
  return strictlyWider(r, main) ? r : null;
}

function tryMatchBrackets(
  state: EditorState,
  head: number,
): ReturnType<typeof matchBrackets> | null {
  return matchBrackets(state, head, 1) ?? matchBrackets(state, head, -1);
}

function candidateBracketInner(
  state: EditorState,
  main: SelectionRange,
): SelectionRange | null {
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, main.head)) {
    return null;
  }
  const m = tryMatchBrackets(state, main.head);
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
  if (inOpaqueBlock(state, main.head)) {
    return null;
  }
  if (wikiLinkMatchAtDocPosition(state.doc, main.head)) {
    return null;
  }
  const m = tryMatchBrackets(state, main.head);
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

function candidateSentence(state: EditorState, main: SelectionRange): SelectionRange | null {
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
    candidateClause,
    candidateBracketInner,
    candidateBracketOuter,
    candidateWikiInner,
    candidateWikiFull,
    candidateSyntaxInner,
    candidateSentence,
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

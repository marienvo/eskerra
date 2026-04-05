import {markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import {
  EditorSelection,
  EditorState,
  type ChangeSet,
  type Extension,
  Prec,
  type SelectionRange,
} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';

/**
 * Same intent as `@codemirror/lang-markdown` pasteURLAsLink, but omit plain `mark` (would match
 * Lezer names like `EmphasisMark`). HTML `Mark` is still excluded via word-boundary-safe checks below.
 */
const nonPlainText = /code|horizontalrule|html|link|comment|processing|escape|entity|image|url/i;

function nameLooksNonPlain(name: string): boolean {
  if (nonPlainText.test(name)) {
    return true;
  }
  return /^Mark$/i.test(name);
}

function selectionCrossesNonPlainTree(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  let crosses = false;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (nameLooksNonPlain(node.name)) {
        crosses = true;
      }
    },
  });
  return crosses;
}

/**
 * True when pasteURLAsLink-style wrapping is safe: markdown active and selection does not cross
 * syntax-only / non-plain constructs (e.g. code, links).
 */
export function selectionIsMarkdownPlain(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  if (from === to) {
    return false;
  }
  if (!markdownLanguage.isActiveAt(state, from, 1)) {
    return false;
  }
  return !selectionCrossesNonPlainTree(state, from, to);
}

function inlineGuardOk(doc: EditorState['doc'], from: number, to: number): boolean {
  return !doc.sliceString(from, to).includes('\n');
}

/**
 * Remove non-overlapping paired spans of a two-character delimiter inside `s` (left-to-right stack).
 */
export function stripBalancedDoubleToken(s: string, token: string): string {
  if (token.length !== 2) {
    throw new Error('stripBalancedDoubleToken expects a two-character delimiter.');
  }
  const openCh = token[0];
  const closeCh = token[1];
  type Pair = readonly [number, number];
  const pairs: Pair[] = [];
  const stack: number[] = [];
  for (let i = 0; i + 1 < s.length; ) {
    if (s[i] === openCh && s[i + 1] === closeCh) {
      if (stack.length) {
        const open = stack.pop()!;
        pairs.push([open, i]);
      } else {
        stack.push(i);
      }
      i += 2;
    } else {
      i += 1;
    }
  }
  const drop = new Set<number>();
  for (const [a, b] of pairs) {
    drop.add(a);
    drop.add(a + 1);
    drop.add(b);
    drop.add(b + 1);
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (!drop.has(i)) {
      out += s[i];
    }
  }
  return out;
}

/**
 * After removing `doubleToken` pairs, remove paired single `singleChar` spans inside `s`.
 */
export function stripBalancedSingleChars(
  s: string,
  singleChar: string,
  doubleToken: string,
): string {
  const afterStrong = stripBalancedDoubleToken(s, doubleToken);
  const pairs: Array<readonly [number, number]> = [];
  const stack: number[] = [];
  for (let i = 0; i < afterStrong.length; i++) {
    if (afterStrong[i] === singleChar) {
      if (stack.length) {
        const open = stack.pop()!;
        pairs.push([open, i]);
      } else {
        stack.push(i);
      }
    }
  }
  const drop = new Set<number>();
  for (const [a, b] of pairs) {
    drop.add(a);
    drop.add(b);
  }
  let out = '';
  for (let i = 0; i < afterStrong.length; i++) {
    if (!drop.has(i)) {
      out += afterStrong[i];
    }
  }
  return out;
}

/** Remove paired `**...**` spans inside s (non-overlapping pairs, left-to-right). */
export function stripBalancedDoubleAsterisks(s: string): string {
  return stripBalancedDoubleToken(s, '**');
}

/** Remove paired single `*...*` spans inside s after `**` stripping. */
export function stripBalancedSingleAsterisks(s: string): string {
  return stripBalancedSingleChars(s, '*', '**');
}

function outerDoubleDelim(
  doc: EditorState['doc'],
  from: number,
  to: number,
  double: string,
): boolean {
  const dLen = double.length;
  return (
    from >= dLen
    && to + dLen <= doc.length
    && doc.sliceString(from - dLen, from) === double
    && doc.sliceString(to, to + dLen) === double
  );
}

function outerSingleDelim(
  doc: EditorState['doc'],
  from: number,
  to: number,
  single: string,
  double: string,
): boolean {
  const dLen = double.length;
  if (from < 1 || to + 1 > doc.length) {
    return false;
  }
  if (doc.sliceString(from - 1, from) !== single) {
    return false;
  }
  if (doc.sliceString(to, to + 1) !== single) {
    return false;
  }
  if (from >= dLen && doc.sliceString(from - dLen, from) === double) {
    return false;
  }
  if (to + dLen <= doc.length && doc.sliceString(to, to + dLen) === double) {
    return false;
  }
  return true;
}

function selectionIsWholeSingleSpan(
  doc: EditorState['doc'],
  from: number,
  to: number,
  single: string,
): boolean {
  if (to - from < 3) {
    return false;
  }
  if (doc.sliceString(from, from + 1) !== single) {
    return false;
  }
  if (doc.sliceString(to - 1, to) !== single) {
    return false;
  }
  return from + 1 < to - 1;
}

function selectionIsWholeDoubleSpan(
  doc: EditorState['doc'],
  from: number,
  to: number,
  double: string,
): boolean {
  const dLen = double.length;
  if (to - from < dLen * 2 + 1) {
    return false;
  }
  if (doc.sliceString(from, from + dLen) !== double) {
    return false;
  }
  if (doc.sliceString(to - dLen, to) !== double) {
    return false;
  }
  const innerFrom = from + dLen;
  const innerTo = to - dLen;
  return innerFrom < innerTo;
}

function canWikiUnwrap(doc: EditorState['doc'], from: number, to: number): boolean {
  return (
    from >= 2
    && to + 2 <= doc.length
    && doc.sliceString(from - 2, from) === '[['
    && doc.sliceString(to, to + 2) === ']]'
  );
}

function wikiCloseStep(
  doc: EditorState['doc'],
  from: number,
  _to: number,
): boolean {
  if (from < 1) {
    return false;
  }
  if (doc.sliceString(from - 1, from) !== '[') {
    return false;
  }
  if (from >= 2 && doc.sliceString(from - 2, from) === '[[') {
    return false;
  }
  return true;
}

export type SymmetricSurroundConfig =
  | {
      readonly mode: 'singleDouble';
      readonly single: string;
      readonly double: string;
    }
  | {
      readonly mode: 'pairedOnly';
      readonly double: string;
    };

type SurroundChange = {
  from: number;
  to: number;
  insert: string;
  selFrom: number;
  selTo: number;
};

function normalizeSymmetricInner(slice: string, cfg: SymmetricSurroundConfig): string {
  if (cfg.mode === 'pairedOnly') {
    return stripBalancedDoubleToken(slice, cfg.double);
  }
  return stripBalancedSingleChars(slice, cfg.single, cfg.double);
}

export function computeSymmetricSurroundChange(
  state: EditorState,
  range: SelectionRange,
  cfg: SymmetricSurroundConfig,
): SurroundChange | null {
  const {doc} = state;
  const {from, to} = range;
  if (!selectionIsMarkdownPlain(state, from, to) || !inlineGuardOk(doc, from, to)) {
    return null;
  }

  const {double} = cfg;
  const dLen = double.length;

  if (selectionIsWholeDoubleSpan(doc, from, to, double)) {
    const inner = doc.sliceString(from + dLen, to - dLen);
    return {
      from,
      to,
      insert: inner,
      selFrom: from,
      selTo: from + inner.length,
    };
  }

  if (outerDoubleDelim(doc, from, to, double)) {
    const inner = doc.sliceString(from, to);
    return {
      from: from - dLen,
      to: to + dLen,
      insert: inner,
      selFrom: from - dLen,
      selTo: to - dLen,
    };
  }

  if (cfg.mode === 'singleDouble') {
    const {single} = cfg;

    if (selectionIsWholeSingleSpan(doc, from, to, single)) {
      const inner = doc.sliceString(from + 1, to - 1);
      return {
        from,
        to,
        insert: inner,
        selFrom: from,
        selTo: from + inner.length,
      };
    }

    if (outerSingleDelim(doc, from, to, single, double)) {
      const inner = doc.sliceString(from, to);
      const insert = `${double}${inner}${double}`;
      return {
        from: from - 1,
        to: to + 1,
        insert,
        selFrom: from + 1,
        selTo: from + 1 + inner.length,
      };
    }

    const rawInner = doc.sliceString(from, to);
    const flat = normalizeSymmetricInner(rawInner, cfg);
    const wrapped = `${single}${flat}${single}`;
    return {
      from,
      to,
      insert: wrapped,
      selFrom: from + 1,
      selTo: from + 1 + flat.length,
    };
  }

  const rawInner = doc.sliceString(from, to);
  const flat = normalizeSymmetricInner(rawInner, cfg);
  const wrapped = `${double}${flat}${double}`;
  return {
    from,
    to,
    insert: wrapped,
    selFrom: from + dLen,
    selTo: from + dLen + flat.length,
  };
}

const SURROUND_STAR: SymmetricSurroundConfig = {
  mode: 'singleDouble',
  single: '*',
  double: '**',
};

const SURROUND_UNDERSCORE: SymmetricSurroundConfig = {
  mode: 'singleDouble',
  single: '_',
  double: '__',
};

const SURROUND_STRIKE: SymmetricSurroundConfig = {mode: 'pairedOnly', double: '~~'};
const SURROUND_MUTED: SymmetricSurroundConfig = {mode: 'pairedOnly', double: '%%'};
const SURROUND_HIGHLIGHT: SymmetricSurroundConfig = {mode: 'pairedOnly', double: '=='};

type WikiClass = 'unwrap' | 'close' | 'open';

function classifyWiki(doc: EditorState['doc'], from: number, to: number): WikiClass {
  if (canWikiUnwrap(doc, from, to)) {
    return 'unwrap';
  }
  if (wikiCloseStep(doc, from, to)) {
    return 'close';
  }
  return 'open';
}

type WikiChange = {
  changes: readonly {from: number; to: number; insert: string}[];
  kind: WikiClass;
};

function selectionTouchesCodeBlock(state: EditorState, from: number, to: number): boolean {
  let bad = false;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (/^(?:CodeBlock|FencedCode|InlineCode)$/i.test(node.name)) {
        bad = true;
      }
    },
  });
  return bad;
}

function selectionAllowsWikiChange(
  state: EditorState,
  from: number,
  to: number,
  kind: WikiClass,
): boolean {
  const {doc} = state;
  if (!inlineGuardOk(doc, from, to)) {
    return false;
  }
  if (!markdownLanguage.isActiveAt(state, from, 1)) {
    return false;
  }
  if (selectionTouchesCodeBlock(state, from, to)) {
    return false;
  }
  if (kind === 'open') {
    return selectionIsMarkdownPlain(state, from, to);
  }
  return true;
}

function computeWikiChange(
  state: EditorState,
  range: SelectionRange,
  kind: WikiClass,
): WikiChange | null {
  const {doc} = state;
  const {from, to} = range;
  if (!selectionAllowsWikiChange(state, from, to, kind)) {
    return null;
  }

  if (kind === 'unwrap') {
    const inner = doc.sliceString(from, to);
    const delFrom = from - 2;
    const delTo = to + 2;
    return {
      kind: 'unwrap',
      changes: [{from: delFrom, to: delTo, insert: inner}],
    };
  }

  if (kind === 'close') {
    return {
      kind: 'close',
      changes: [
        {from: from - 1, to: from - 1, insert: '['},
        {from: to, to, insert: ']]'},
      ],
    };
  }

  return {
    kind: 'open',
    changes: [{from, to: from, insert: '['}],
  };
}

function wikiRangesAfterChanges(
  cs: ChangeSet,
  state: EditorState,
  kind: WikiClass,
): readonly SelectionRange[] {
  return state.selection.ranges.map(r => {
    if (kind === 'unwrap') {
      const innerLen = r.to - r.from;
      const innerFrom = cs.mapPos(r.from - 2, 1);
      return EditorSelection.range(innerFrom, innerFrom + innerLen);
    }
    return EditorSelection.range(cs.mapPos(r.from, 1), cs.mapPos(r.to, -1));
  });
}

function wikiKindsAgree(state: EditorState): WikiClass | null {
  const ranges = state.selection.ranges;
  if (!ranges.length) {
    return null;
  }
  const first = classifyWiki(state.doc, ranges[0].from, ranges[0].to);
  for (let i = 1; i < ranges.length; i++) {
    const k = classifyWiki(state.doc, ranges[i].from, ranges[i].to);
    if (k !== first) {
      return null;
    }
  }
  return first;
}

function mapAnchoredSelection(
  cs: ChangeSet,
  anchorFrom: number,
  selFrom: number,
  selTo: number,
): SelectionRange {
  const a = cs.mapPos(anchorFrom, 1) + (selFrom - anchorFrom);
  const b = cs.mapPos(anchorFrom, 1) + (selTo - anchorFrom);
  return EditorSelection.range(a, b);
}

function dispatchSurround(
  view: EditorView,
  planned: readonly SurroundChange[],
): boolean {
  const state = view.state;
  const pieces = [...planned]
    .sort((a, b) => a.from - b.from)
    .map(c => ({from: c.from, to: c.to, insert: c.insert}));
  const cs = state.changes(pieces);
  const newRanges = planned.map(c => mapAnchoredSelection(cs, c.from, c.selFrom, c.selTo));
  view.dispatch({
    changes: cs,
    selection: EditorSelection.create(newRanges, state.selection.mainIndex),
    scrollIntoView: true,
  });
  return true;
}

function trySymmetricSurround(view: EditorView, cfg: SymmetricSurroundConfig): boolean {
  const state = view.state;
  const ranges = state.selection.ranges;
  if (!ranges.length || ranges.some(r => r.empty)) {
    return false;
  }
  const planned: SurroundChange[] = [];
  for (const r of ranges) {
    const c = computeSymmetricSurroundChange(state, r, cfg);
    if (!c) {
      return false;
    }
    planned.push(c);
  }
  return dispatchSurround(view, planned);
}

function runStarSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_STAR);
}

function runUnderscoreSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_UNDERSCORE);
}

function runStrikeSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_STRIKE);
}

function runMutedSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_MUTED);
}

function runHighlightSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_HIGHLIGHT);
}

function dispatchWiki(view: EditorView, kind: WikiClass): boolean {
  const state = view.state;
  const planned: WikiChange[] = [];
  for (const r of state.selection.ranges) {
    const c = computeWikiChange(state, r, kind);
    if (!c) {
      return false;
    }
    planned.push(c);
  }
  const pieces = planned
    .flatMap(p => [...p.changes])
    .sort((x, y) => x.from - y.from);
  const cs = state.changes(pieces);
  const newRanges = wikiRangesAfterChanges(cs, state, kind);
  view.dispatch({
    changes: cs,
    selection: EditorSelection.create(newRanges, state.selection.mainIndex),
    scrollIntoView: true,
  });
  return true;
}

function runBracketSurround(view: EditorView): boolean {
  const ranges = view.state.selection.ranges;
  if (!ranges.length || ranges.some(r => r.empty)) {
    return false;
  }
  const kind = wikiKindsAgree(view.state);
  if (kind == null) {
    return false;
  }
  for (const r of ranges) {
    if (computeWikiChange(view.state, r, kind) == null) {
      return false;
    }
  }
  return dispatchWiki(view, kind);
}

/** Set on editors that should preserve multiple selection ranges (required for multi-cursor surround). */
export function markdownSelectionAllowMultipleRanges(): Extension {
  return EditorState.allowMultipleSelections.of(true);
}

/**
 * Prec.high keymap: wiki `[`; symmetric inline markup (`*` / `**`, `_` / `__`, `~~`, `%%`, `==`).
 * Key names follow CodeMirror conventions; US QWERTY is the reference layout (see desktop-editor spec).
 */
export function markdownSelectionSurroundKeymap(): Extension {
  return Prec.high(
    keymap.of([
      {key: '[', run: runBracketSurround},
      {key: '*', run: runStarSurround},
      {key: 'Shift-8', run: runStarSurround},
      {key: 'Shift-*', run: runStarSurround},
      {key: '_', run: runUnderscoreSurround},
      {key: 'Shift-Minus', run: runUnderscoreSurround},
      {key: '~', run: runStrikeSurround},
      {key: '%', run: runMutedSurround},
      {key: '=', run: runHighlightSurround},
    ]),
  );
}

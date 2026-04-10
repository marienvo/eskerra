import {markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import {
  EditorSelection,
  EditorState,
  type ChangeSet,
  type Extension,
  Prec,
  type SelectionRange,
  type Transaction,
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

/** Like {@link selectionCrossesNonPlainTree}, but inline code spans are allowed (unwrap / re-wrap). */
function selectionCrossesNonPlainTreeAllowingInlineCode(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  let crosses = false;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (/^InlineCode$/i.test(node.name)) {
        return false;
      }
      if (nameLooksNonPlain(node.name)) {
        crosses = true;
      }
    },
  });
  return crosses;
}

/**
 * Plain markdown for inline-code surround: same as {@link selectionIsMarkdownPlain}, except selections
 * may lie inside or cover an `InlineCode` Lezer node (for toggle-off).
 */
export function selectionIsMarkdownPlainForInlineCodeSurround(
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
  return !selectionCrossesNonPlainTreeAllowingInlineCode(state, from, to);
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

function maxConsecutiveBackticksIn(s: string): number {
  let max = 0;
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '`') {
      run++;
      max = Math.max(max, run);
    } else {
      run = 0;
    }
  }
  return max;
}

function backtickRunLengthAtStart(s: string): number {
  let i = 0;
  while (i < s.length && s[i] === '`') {
    i++;
  }
  return i;
}

function backtickRunLengthAtEnd(s: string): number {
  let i = s.length;
  while (i > 0 && s[i - 1] === '`') {
    i--;
  }
  return s.length - i;
}

/**
 * Build CommonMark-style inline code delimiters: run length max(1, longest inner backtick run + 1);
 * pad with spaces when inner touches a backtick.
 */
export function buildInlineCodeReplacement(inner: string): string {
  const maxRun = maxConsecutiveBackticksIn(inner);
  const fenceLen = Math.max(1, maxRun + 1);
  const fence = '`'.repeat(fenceLen);
  let body = inner;
  if (body.startsWith('`') || body.endsWith('`')) {
    body = ` ${body} `;
  }
  return `${fence}${body}${fence}`;
}

function sliceIsCompleteInlineCodeFence(slice: string): string | null {
  const openLen = backtickRunLengthAtStart(slice);
  if (openLen < 1 || slice.length < openLen * 2 + 1) {
    return null;
  }
  const closeLen = backtickRunLengthAtEnd(slice);
  if (closeLen !== openLen) {
    return null;
  }
  if (slice.slice(-openLen) !== '`'.repeat(openLen)) {
    return null;
  }
  return slice.slice(openLen, slice.length - openLen);
}

function countBackticksBefore(doc: EditorState['doc'], pos: number): number {
  let n = 0;
  for (let p = pos - 1; p >= 0; p--) {
    if (doc.sliceString(p, p + 1) !== '`') {
      break;
    }
    n++;
  }
  return n;
}

function countBackticksAfter(doc: EditorState['doc'], pos: number): number {
  const len = doc.length;
  let n = 0;
  for (let p = pos; p < len; p++) {
    if (doc.sliceString(p, p + 1) !== '`') {
      break;
    }
    n++;
  }
  return n;
}

export function computeInlineCodeSurroundChange(
  state: EditorState,
  range: SelectionRange,
): SurroundChange | null {
  const {doc} = state;
  const {from, to} = range;
  if (!inlineGuardOk(doc, from, to) || !selectionIsMarkdownPlainForInlineCodeSurround(state, from, to)) {
    return null;
  }

  const selected = doc.sliceString(from, to);
  const wholeInner = sliceIsCompleteInlineCodeFence(selected);
  if (wholeInner != null) {
    return {
      from,
      to,
      insert: wholeInner,
      selFrom: from,
      selTo: from + wholeInner.length,
    };
  }

  const openBefore = countBackticksBefore(doc, from);
  const closeAfter = countBackticksAfter(doc, to);
  if (openBefore > 0 && openBefore === closeAfter) {
    const inner = selected;
    return {
      from: from - openBefore,
      to: to + closeAfter,
      insert: inner,
      selFrom: from - openBefore,
      selTo: to - openBefore,
    };
  }

  const insert = buildInlineCodeReplacement(selected);
  const fenceLen = backtickRunLengthAtStart(insert);
  const body = insert.slice(fenceLen, insert.length - fenceLen);
  return {
    from,
    to,
    insert,
    selFrom: from + fenceLen,
    selTo: from + fenceLen + body.length,
  };
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

/** Remove non-overlapping paired `(`…`)` spans inside `s` (stack, left-to-right). */
export function stripBalancedParens(s: string): string {
  const pairs: Array<readonly [number, number]> = [];
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') {
      stack.push(i);
    } else if (ch === ')') {
      if (stack.length) {
        const open = stack.pop()!;
        pairs.push([open, i]);
      }
    }
  }
  const drop = new Set<number>();
  for (const [a, b] of pairs) {
    drop.add(a);
    drop.add(b);
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (!drop.has(i)) {
      out += s[i];
    }
  }
  return out;
}

/** Remove non-overlapping paired `{`…`}` spans inside `s` (stack, left-to-right). */
export function stripBalancedBraces(s: string): string {
  const pairs: Array<readonly [number, number]> = [];
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') {
      stack.push(i);
    } else if (ch === '}') {
      if (stack.length) {
        const open = stack.pop()!;
        pairs.push([open, i]);
      }
    }
  }
  const drop = new Set<number>();
  for (const [a, b] of pairs) {
    drop.add(a);
    drop.add(b);
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (!drop.has(i)) {
      out += s[i];
    }
  }
  return out;
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

function selectionIsWholeDelimiterPairSpan(
  doc: EditorState['doc'],
  from: number,
  to: number,
  open: string,
  close: string,
): boolean {
  const oLen = open.length;
  const cLen = close.length;
  if (to - from < oLen + cLen + 1) {
    return false;
  }
  if (doc.sliceString(from, from + oLen) !== open) {
    return false;
  }
  if (doc.sliceString(to - cLen, to) !== close) {
    return false;
  }
  return from + oLen < to - cLen;
}

function outerDelimiterPair(
  doc: EditorState['doc'],
  from: number,
  to: number,
  open: string,
  close: string,
): boolean {
  const oLen = open.length;
  const cLen = close.length;
  if (from < oLen || to + cLen > doc.length) {
    return false;
  }
  if (doc.sliceString(from - oLen, from) !== open) {
    return false;
  }
  if (doc.sliceString(to, to + cLen) !== close) {
    return false;
  }
  return true;
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
      /**
       * When true (e.g. Mod-I): selection inside outer single delimiters unwraps instead of
       * upgrading to double (strong). Typing `*` keeps the promote-to-`**` behavior.
       */
      readonly outerSingleUnwrapsInsteadOfUpgrade?: boolean;
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

export type DelimiterPairSurroundOptions = {
  readonly normalizeInner?: (inner: string) => string;
};

/**
 * Wrap or unwrap a selection with a delimiter pair (`()` `{}` `"` `'` etc.).
 * Toggle order matches symmetric inline markup: whole span unwrap, outer unwrap, then wrap.
 */
export function computeDelimiterPairSurroundChange(
  state: EditorState,
  range: SelectionRange,
  open: string,
  close: string,
  options?: DelimiterPairSurroundOptions,
): SurroundChange | null {
  const oLen = open.length;
  const cLen = close.length;
  if (oLen < 1 || cLen < 1) {
    return null;
  }

  const {doc} = state;
  const {from, to} = range;
  if (!selectionIsMarkdownPlain(state, from, to) || !inlineGuardOk(doc, from, to)) {
    return null;
  }

  if (selectionIsWholeDelimiterPairSpan(doc, from, to, open, close)) {
    const inner = doc.sliceString(from + oLen, to - cLen);
    return {
      from,
      to,
      insert: inner,
      selFrom: from,
      selTo: from + inner.length,
    };
  }

  if (outerDelimiterPair(doc, from, to, open, close)) {
    const inner = doc.sliceString(from, to);
    const delFrom = from - oLen;
    const delTo = to + cLen;
    return {
      from: delFrom,
      to: delTo,
      insert: inner,
      selFrom: delFrom,
      selTo: delFrom + inner.length,
    };
  }

  const rawInner = doc.sliceString(from, to);
  const flat = options?.normalizeInner ? options.normalizeInner(rawInner) : rawInner;
  const wrapped = `${open}${flat}${close}`;
  return {
    from,
    to,
    insert: wrapped,
    selFrom: from + oLen,
    selTo: from + oLen + flat.length,
  };
}

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
      if (cfg.outerSingleUnwrapsInsteadOfUpgrade) {
        return {
          from: from - 1,
          to: to + 1,
          insert: inner,
          selFrom: from - 1,
          selTo: from - 1 + inner.length,
        };
      }
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

const SURROUND_BOLD_STAR: SymmetricSurroundConfig = {
  mode: 'pairedOnly',
  double: '**',
};

const SURROUND_STAR_ITALIC_SHORTCUT: SymmetricSurroundConfig = {
  mode: 'singleDouble',
  single: '*',
  double: '**',
  outerSingleUnwrapsInsteadOfUpgrade: true,
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

/** Toggle `**…**` around non-empty markdown-plain selections (vault note + table cells). */
export function runMarkdownBoldSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_BOLD_STAR);
}

/**
 * Toggle `*…*` around selections; outer single-`*` unwraps instead of promoting to `**`
 * (differs from typing `*`).
 */
export function runMarkdownItalicSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_STAR_ITALIC_SHORTCUT);
}

/** Toggle `~~…~~` around selections. */
export function runMarkdownStrikethroughSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_STRIKE);
}

/** Toggle inline code fences around selections (same rules as backtick surround). */
export function runMarkdownInlineCodeSurround(view: EditorView): boolean {
  return tryInlineCodeSurround(view);
}

/** Toggle `==…==` (highlight) around selections. */
export function runMarkdownHighlightSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_HIGHLIGHT);
}

/** Toggle `%%…%%` (muted / comment) around selections. */
export function runMarkdownMutedSurround(view: EditorView): boolean {
  return trySymmetricSurround(view, SURROUND_MUTED);
}

function changeIsUnwrap(c: SurroundChange): boolean {
  return c.to - c.from > c.insert.length;
}

/**
 * Best-effort: remove one outer inline-markdown layer for the main selection (non-empty).
 * Tries, in order: inline code, `**`, `*`, `~~`, `==`, `%%`. Returns false if nothing matched.
 * Multi-cursor: not supported; only {@link EditorSelection.main} is considered.
 */
export function runMarkdownClearOneInlineLayerSurround(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  if (range.empty) {
    return false;
  }
  const c = computeClearOneInlineLayerChange(state, range);
  if (!c) {
    return false;
  }
  return dispatchSurround(view, [c]);
}

function computeClearOneInlineLayerChange(
  state: EditorState,
  range: SelectionRange,
): SurroundChange | null {
  const unwrapCandidates: Array<SurroundChange | null> = [
    computeInlineCodeSurroundChange(state, range),
    computeSymmetricSurroundChange(state, range, SURROUND_BOLD_STAR),
    computeSymmetricSurroundChange(state, range, SURROUND_STAR_ITALIC_SHORTCUT),
    computeSymmetricSurroundChange(state, range, SURROUND_STRIKE),
    computeSymmetricSurroundChange(state, range, SURROUND_HIGHLIGHT),
    computeSymmetricSurroundChange(state, range, SURROUND_MUTED),
  ];
  for (const c of unwrapCandidates) {
    if (c && changeIsUnwrap(c)) {
      return c;
    }
  }
  return null;
}

/**
 * Common word-processor chords for inline markdown (`Mod` = Cmd on macOS, Ctrl elsewhere).
 * Registered with {@link Prec.high} so it wins over default keymaps where needed.
 */
export function markdownFormattingModKeymap(): Extension {
  return Prec.high(
    keymap.of([
      {key: 'Mod-b', run: runMarkdownBoldSurround, preventDefault: true},
      {key: 'Mod-i', run: runMarkdownItalicSurround, preventDefault: true},
      {
        key: 'Mod-Shift-x',
        run: runMarkdownStrikethroughSurround,
        preventDefault: true,
      },
      {key: 'Mod-e', run: runMarkdownInlineCodeSurround, preventDefault: true},
      {key: 'Mod-`', run: runMarkdownInlineCodeSurround, preventDefault: true},
    ]),
  );
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

function tryInlineCodeSurround(view: EditorView): boolean {
  const state = view.state;
  const ranges = state.selection.ranges;
  if (!ranges.length || ranges.some(r => r.empty)) {
    return false;
  }
  const planned: SurroundChange[] = [];
  for (const r of ranges) {
    const c = computeInlineCodeSurroundChange(state, r);
    if (!c) {
      return false;
    }
    planned.push(c);
  }
  return dispatchSurround(view, planned);
}

/**
 * WebKit / some Linux WebView stacks deliver inline code as `insertText` without a reliable
 * keydown match for `{ key: '`' }`. Intercept that path when it is exactly one grave accent.
 */
function inlineCodeBacktickInputHandler(
  view: EditorView,
  _from: number,
  _to: number,
  text: string,
  _insert: () => Transaction,
): boolean {
  if (text !== '`') {
    return false;
  }
  return tryInlineCodeSurround(view);
}

/** Pair with {@link markdownSelectionSurroundKeymap} so backtick surround works under WebKit/GTK. */
export function markdownInlineCodeSurroundInputHandler(): Extension {
  return EditorView.inputHandler.of(inlineCodeBacktickInputHandler);
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

function tryDelimiterPairSurround(
  view: EditorView,
  open: string,
  close: string,
  options?: DelimiterPairSurroundOptions,
): boolean {
  const state = view.state;
  const ranges = state.selection.ranges;
  if (!ranges.length || ranges.some(r => r.empty)) {
    return false;
  }
  const planned: SurroundChange[] = [];
  for (const r of ranges) {
    const c = computeDelimiterPairSurroundChange(state, r, open, close, options);
    if (!c) {
      return false;
    }
    planned.push(c);
  }
  return dispatchSurround(view, planned);
}

function runParenSurround(view: EditorView): boolean {
  return tryDelimiterPairSurround(view, '(', ')', {normalizeInner: stripBalancedParens});
}

function runBraceSurround(view: EditorView): boolean {
  return tryDelimiterPairSurround(view, '{', '}', {normalizeInner: stripBalancedBraces});
}

function runDoubleQuoteSurround(view: EditorView): boolean {
  return tryDelimiterPairSurround(view, '"', '"');
}

function runSingleQuoteSurround(view: EditorView): boolean {
  return tryDelimiterPairSurround(view, "'", "'");
}

/** Set on editors that should preserve multiple selection ranges (required for multi-cursor surround). */
export function markdownSelectionAllowMultipleRanges(): Extension {
  return EditorState.allowMultipleSelections.of(true);
}

/**
 * Prec.high keymap: wiki `[`; symmetric inline markup (`*` / `**`, `_` / `__`, `~~`, `%%`, `==`);
 * plain delimiter pairs `()`, `{}`, straight `"` / `'`.
 * Inline code uses {@link markdownInlineCodeSurroundInputHandler} plus a Prec.highest backtick keymap.
 * Key names follow CodeMirror conventions; US QWERTY is the reference layout (see desktop-editor spec).
 */
export function markdownSelectionSurroundKeymap(): Extension {
  return [
    Prec.highest(keymap.of([{key: '`', run: tryInlineCodeSurround}])),
    Prec.high(
      keymap.of([
        {key: '[', run: runBracketSurround},
        {key: '(', run: runParenSurround},
        {key: 'Shift-9', run: runParenSurround},
        {key: '{', run: runBraceSurround},
        {key: 'Shift-[', run: runBraceSurround},
        {key: '"', run: runDoubleQuoteSurround},
        {key: "Shift-'", run: runDoubleQuoteSurround},
        {key: "'", run: runSingleQuoteSurround},
        {key: '*', run: runStarSurround},
        {key: 'Shift-8', run: runStarSurround},
        {key: 'Shift-*', run: runStarSurround},
        {key: '_', run: runUnderscoreSurround},
        {key: 'Shift-Minus', run: runUnderscoreSurround},
        {key: '~', run: runStrikeSurround},
        {key: '%', run: runMutedSurround},
        {key: '=', run: runHighlightSurround},
      ]),
    ),
  ];
}

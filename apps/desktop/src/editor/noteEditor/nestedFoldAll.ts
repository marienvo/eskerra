import {
  codeFolding,
  foldEffect,
  foldState,
  foldable,
  unfoldAll,
} from '@codemirror/language';
import {type EditorState, StateEffect} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';

/** Same as CodeMirror’s internal `maybeEnable` (not exported). */
function maybeEnableFolding(
  state: EditorState,
  effects: readonly StateEffect<unknown>[],
): StateEffect<unknown>[] {
  return state.field(foldState, false)
    ? [...effects]
    : [...effects, StateEffect.appendConfig.of(codeFolding())];
}

export function collectFoldableRanges(state: EditorState): Array<{
  from: number;
  to: number;
}> {
  const seen = new Set<string>();
  const out: Array<{from: number; to: number}> = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const r = foldable(state, line.from, line.to);
    if (r == null || r.to <= r.from) {
      continue;
    }
    const key = `${r.from},${r.to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({from: r.from, to: r.to});
  }
  return out;
}

/**
 * Whether {@link nestedCollapseAllFolds} would fold at least one range (same `foldable` / dedupe
 * rules as {@link collectFoldableRanges}, but stops at the first hit).
 */
export function foldableRangesPresent(state: EditorState): boolean {
  const seen = new Set<string>();
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const r = foldable(state, line.from, line.to);
    if (r == null || r.to <= r.from) {
      continue;
    }
    const key = `${r.from},${r.to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    return true;
  }
  return false;
}

export function sortRangesInnermostFirst(
  ranges: ReadonlyArray<{from: number; to: number}>,
): Array<{from: number; to: number}> {
  return [...ranges].sort((a, b) => a.to - a.from - (b.to - b.from));
}

/**
 * Fold every `foldable` range (lists, sections, …), innermost first so nested structure is preserved
 * (unfolding a parent can leave children folded). Starts from a fully unfolded tree via `unfoldAll`.
 */
export function nestedCollapseAllFolds(view: EditorView): boolean {
  unfoldAll(view);
  const ranges = sortRangesInnermostFirst(collectFoldableRanges(view.state));
  if (ranges.length === 0) {
    return false;
  }
  const effects = ranges.map(r => foldEffect.of(r));
  view.dispatch({effects: maybeEnableFolding(view.state, effects)});
  return true;
}

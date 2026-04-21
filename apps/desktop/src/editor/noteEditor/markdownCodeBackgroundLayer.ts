import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import {EditorSelection, Prec, type Extension} from '@codemirror/state';
import {
  Direction,
  EditorView,
  RectangleMarker,
  layer,
  type LayerMarker,
} from '@codemirror/view';

/** Enough for long notes so `EqualHighlight` exists when the code-background layer builds. */
const SYNTAX_TREE_BUDGET_MS = 1000;

/** Class on {@link RectangleMarker}s for inline `` `code` `` backgrounds (styled in App.css). */
export const markdownInlineCodeBackgroundClass = 'cm-md-inline-code-bg';

/** Class on {@link RectangleMarker}s for `==highlight==` backgrounds (styled in App.css). */
export const markdownEqualHighlightBackgroundClass = 'cm-md-equal-highlight-bg';

/** Same coordinate space as CodeMirror's `getBase` in `@codemirror/view` (layer vs client rects). */
function layerBaseOffset(view: EditorView): {left: number; top: number} {
  const rect = view.scrollDOM.getBoundingClientRect();
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * view.scaleX;
  return {
    left: left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

/**
 * `RectangleMarker.forRange` returns [] when the range does not overlap `view.viewport` (including
 * a degenerate `viewport.to <= viewport.from` before the first layout) or when coords are missing.
 * These fallbacks keep inline pills visible once DOM positions exist.
 */
function inlineRangeBackgroundMarkers(
  view: EditorView,
  from: number,
  to: number,
  cls: string,
): LayerMarker[] {
  const range = EditorSelection.range(from, to);
  const primary = [...RectangleMarker.forRange(view, cls, range)];
  if (primary.length > 0) {
    return primary;
  }

  const c1 = view.coordsAtPos(from, 1);
  const c2 = view.coordsAtPos(to, -1);
  if (c1 && c2) {
    const base = layerBaseOffset(view);
    const left = Math.min(c1.left, c2.left) - base.left;
    const top = Math.min(c1.top, c2.top) - base.top;
    const right = Math.max(c1.right, c2.right) - base.left;
    const bottom = Math.max(c1.bottom, c2.bottom) - base.top;
    return [
      new RectangleMarker(
        cls,
        left,
        top,
        Math.max(0, right - left),
        bottom - top,
      ),
    ];
  }

  try {
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    const domRange = document.createRange();
    domRange.setStart(start.node, start.offset);
    domRange.setEnd(end.node, end.offset);
    const rects = domRange.getClientRects();
    if (rects.length === 0) {
      return [];
    }
    const base = layerBaseOffset(view);
    const out: RectangleMarker[] = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      if (r.width <= 0 && r.height <= 0) {
        continue;
      }
      out.push(
        new RectangleMarker(
          cls,
          r.left - base.left,
          r.top - base.top,
          r.width,
          r.height,
        ),
      );
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * One rectangle covering an entire fenced / indented code block, drawn in a {@link layer} below
 * `drawSelection()`'s `.cm-selectionLayer` so opaque fills never hide selection.
 */
export class MarkdownFenceBlockBackgroundMarker implements LayerMarker {
  readonly top: number;
  readonly height: number;

  constructor(top: number, height: number) {
    this.top = top;
    this.height = height;
  }

  draw(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cm-md-fence-bg';
    el.style.top = `${this.top}px`;
    el.style.height = `${this.height}px`;
    return el;
  }

  update(elt: HTMLElement, _prev: LayerMarker): boolean {
    elt.style.top = `${this.top}px`;
    elt.style.height = `${this.height}px`;
    return true;
  }

  eq(other: LayerMarker): boolean {
    return (
      other instanceof MarkdownFenceBlockBackgroundMarker
      && other.top === this.top
      && other.height === this.height
    );
  }
}

/**
 * Builds the same markers as {@link markdownCodeBackgroundLayer} (for tests and debugging).
 */
export function collectMarkdownCodeBackgroundMarkers(
  view: EditorView,
): readonly LayerMarker[] {
  return buildMarkdownCodeBackgroundMarkers(view);
}

/** Doc range to paint for `==…==`: strip leading/trailing `==` only when they are actually there. */
function equalHighlightPaintRange(
  doc: EditorView['state']['doc'],
  nodeFrom: number,
  nodeTo: number,
): {from: number; to: number} {
  const from = Math.max(0, nodeFrom);
  const to = Math.min(nodeTo, doc.length);
  if (to - from < 2) {
    return {from, to};
  }
  let a = from;
  let b = to;
  if (
    to - from >= 4
    && doc.sliceString(a, a + 2) === '=='
    && doc.sliceString(b - 2, b) === '=='
  ) {
    a = from + 2;
    b = to - 2;
  }
  if (b <= a) {
    return {from, to};
  }
  return {from: a, to: b};
}

/**
 * `RectangleMarker.forRange` can emit a full-content-width “between” slice for some ranges; that
 * reads as a whole-line `==` highlight. Keep only rects whose width matches the highlighted span.
 */
type EqualHighlightSeg = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/**
 * Horizontal bounds per document line for the painted inner range. Used to clip spurious
 * `RectangleMarker.forRange` slices that use CodeMirror's `leftSide` when a span is "open" at the
 * line edge (see `rectanglesForRange` → `fromOpen ? leftSide : fromCoords.left`).
 */
function equalHighlightExpectedSegments(
  view: EditorView,
  paintFrom: number,
  paintTo: number,
): EqualHighlightSeg[] | null {
  const base = layerBaseOffset(view);
  const doc = view.state.doc;
  const fromLine = doc.lineAt(paintFrom);
  const toLine = doc.lineAt(paintTo);
  const segments: EqualHighlightSeg[] = [];
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = doc.line(n);
    const segFrom = Math.max(paintFrom, line.from);
    const segTo = Math.min(paintTo, line.to);
    if (segTo <= segFrom) {
      continue;
    }
    const c1 = view.coordsAtPos(segFrom, 1);
    const c2 = view.coordsAtPos(segTo, -1);
    if (!c1 || !c2) {
      continue;
    }
    segments.push({
      top: Math.min(c1.top, c2.top) - base.top,
      bottom: Math.max(c1.bottom, c2.bottom) - base.top,
      left: Math.min(c1.left, c2.left) - base.left,
      right: Math.max(c1.right, c2.right) - base.left,
    });
  }
  return segments.length > 0 ? segments : null;
}

/** Sub-pixel / rounding slack only — wide `pad` lets fat `forRange` rects pass clipping unchanged. */
function equalHighlightClipMicroPad(view: EditorView): number {
  return Math.min(3, Math.max(1, (view.defaultCharacterWidth || 8) * 0.2));
}

/** Fallback when `forRange` + clip drops everything (missing coords, odd layout). */
function equalHighlightSegmentEnvelopeMarkers(
  view: EditorView,
  paintFrom: number,
  paintTo: number,
  cls: string,
): LayerMarker[] {
  const segs = equalHighlightExpectedSegments(view, paintFrom, paintTo);
  if (!segs) {
    return [];
  }
  const pad = equalHighlightClipMicroPad(view);
  return segs.map(
    s =>
      new RectangleMarker(
        cls,
        s.left - pad,
        s.top,
        Math.max(0, s.right - s.left + pad * 2),
        s.bottom - s.top,
      ),
  );
}

function clipEqualHighlightMarkersToTextBounds(
  view: EditorView,
  paintFrom: number,
  paintTo: number,
  markers: LayerMarker[],
): LayerMarker[] {
  const segs = equalHighlightExpectedSegments(view, paintFrom, paintTo);
  if (!segs) {
    return markers;
  }
  const microPad = equalHighlightClipMicroPad(view);
  const out: LayerMarker[] = [];

  for (const m of markers) {
    if (!(m instanceof RectangleMarker) || m.width == null) {
      out.push(m);
      continue;
    }
    const mTop = m.top;
    const mBottom = m.top + m.height;
    const mLeft = m.left;
    const mRight = m.left + m.width;

    let best: EqualHighlightSeg | null = null;
    let bestOverlap = 0;
    let bestHoriz = -1;
    for (const s of segs) {
      const overlap = Math.max(
        0,
        Math.min(mBottom, s.bottom) - Math.max(mTop, s.top),
      );
      const horiz = Math.max(
        0,
        Math.min(mRight, s.right) - Math.max(mLeft, s.left),
      );
      if (
        overlap > bestOverlap
        || (overlap === bestOverlap && horiz > bestHoriz)
      ) {
        bestOverlap = overlap;
        bestHoriz = horiz;
        best = s;
      }
    }

    if (!best || bestOverlap < Math.min(4, 0.12 * m.height)) {
      continue;
    }

    const clipL = Math.max(mLeft, best.left - microPad);
    const clipR = Math.min(mRight, best.right + microPad);
    const clipW = Math.max(0, clipR - clipL);
    if (clipW <= 0) {
      continue;
    }

    if (clipL !== mLeft || clipW !== m.width) {
      out.push(
        new RectangleMarker(
          markdownEqualHighlightBackgroundClass,
          clipL,
          m.top,
          clipW,
          m.height,
        ),
      );
    } else {
      out.push(m);
    }
  }

  return out;
}

function filterEqualHighlightRectMarkers(
  view: EditorView,
  innerSpanChars: number,
  markers: LayerMarker[],
): LayerMarker[] {
  const cw = view.defaultCharacterWidth || 8;
  const generous = cw * Math.max(1, innerSpanChars) * 2.6 + 56;
  const maxW = Math.min(view.scrollDOM.clientWidth * 0.65, Math.max(96, generous));
  const rects = markers.filter((m): m is RectangleMarker => m instanceof RectangleMarker);
  const ok = rects.filter(m => m.width == null || m.width <= maxW);
  if (ok.length > 0) {
    return ok;
  }
  if (rects.length > 0) {
    const best = rects.reduce((a, b) =>
      (a.width ?? 1e9) <= (b.width ?? 1e9) ? a : b,
    );
    if (best.width != null && best.width <= maxW * 1.2) {
      return [best];
    }
    return [];
  }
  return markers;
}

function buildMarkdownCodeBackgroundMarkers(view: EditorView): LayerMarker[] {
  const doc = view.state.doc;
  const docLen = doc.length;
  ensureSyntaxTree(view.state, docLen, SYNTAX_TREE_BUDGET_MS);
  const tree = syntaxTree(view.state);
  const out: LayerMarker[] = [];

  /* Full-doc walk: `view.viewport` can omit the first lines (or be degenerate) before layout; inline
   * `` `…` `` near the top must still get markers once coords exist. */
  tree.iterate({
    from: 0,
    to: docLen,
    enter(cursor) {
      const name = cursor.name;
      if (name === 'FencedCode' || name === 'CodeBlock') {
        const blockFrom = cursor.from;
        const blockTo = Math.min(cursor.to, docLen);
        const lastChar = Math.max(blockFrom, blockTo - 1);
        const startLine = doc.lineAt(blockFrom);
        const endLine = doc.lineAt(Math.min(lastChar, docLen - 1));
        const first = view.lineBlockAt(startLine.from);
        const last = view.lineBlockAt(endLine.from);
        out.push(
          new MarkdownFenceBlockBackgroundMarker(
            first.top,
            last.bottom - first.top,
          ),
        );
        return false;
      }
      if (name === 'InlineCode') {
        for (const m of inlineRangeBackgroundMarkers(view, cursor.from, cursor.to, markdownInlineCodeBackgroundClass)) {
          out.push(m);
        }
      }
      if (name === 'EqualHighlight') {
        /* Prefer inner text (skips `==` when present) so coords stay valid when delimiter spans are
         * `display:none` off the marker-focus line. If the tree node is already inner-only, the
         * slice guard leaves the range unchanged. */
        const {from: paintFrom, to: paintTo} = equalHighlightPaintRange(doc, cursor.from, cursor.to);
        let markers = inlineRangeBackgroundMarkers(
          view,
          paintFrom,
          paintTo,
          markdownEqualHighlightBackgroundClass,
        );
        if (
          markers.length === 0
          && (paintFrom !== cursor.from || paintTo !== cursor.to)
        ) {
          markers = inlineRangeBackgroundMarkers(
            view,
            cursor.from,
            cursor.to,
            markdownEqualHighlightBackgroundClass,
          );
        }
        markers = filterEqualHighlightRectMarkers(
          view,
          paintTo - paintFrom,
          markers,
        );
        markers = clipEqualHighlightMarkersToTextBounds(
          view,
          paintFrom,
          paintTo,
          markers,
        );
        if (markers.length === 0) {
          markers = equalHighlightSegmentEnvelopeMarkers(
            view,
            paintFrom,
            paintTo,
            markdownEqualHighlightBackgroundClass,
          );
        }
        for (const m of markers) {
          out.push(m);
        }
      }
    },
  });

  return out;
}

/**
 * Renders fenced-code block fills and inline-code pill fills below CodeMirror's selection layer
 * (see discuss.codemirror.net: line backgrounds in `.cm-content` cover `.cm-selectionLayer`).
 */
export const markdownCodeBackgroundLayer: Extension = Prec.low(
  layer({
    above: false,
    class: 'cm-md-codeBackgroundLayer',
    update: u =>
      u.docChanged
      || u.viewportChanged
      || u.geometryChanged
      || u.heightChanged
      || u.selectionSet
      || u.focusChanged,
    markers: view => buildMarkdownCodeBackgroundMarkers(view),
  }),
);

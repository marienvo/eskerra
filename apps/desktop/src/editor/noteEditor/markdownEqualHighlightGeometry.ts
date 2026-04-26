/**
 * Equal-highlight **layer geometry** (width filter + clip + fallback), separate from the syntax walk
 * in `markdownCodeBackgroundLayer.ts`.
 *
 * **Why:** `RectangleMarker.forRange` reuses CodeMirror’s selection-rectangle logic. That can emit
 * full-width “open edge” slices (`leftSide` in `rectanglesForRange`) and other wide rects—wrong for
 * a tight pill under real text. We clip to per-line bounds from `coordsAtPos` on the **inner** paint
 * range (after `equalHighlightPaintRange` strips `==`).
 *
 * **Pipeline:** `filterEqualHighlightRectMarkers` → `clipEqualHighlightMarkersToSegmentBounds` → if
 * empty, `equalHighlightSegmentEnvelopeMarkersFromSegments`. Entry point for the layer:
 * `finalizeEqualHighlightBackgroundMarkers`.
 *
 * **Tests:** Pure helpers (`paintRange`, `filter*`, `clip*`, micro-pad) live in
 * `markdownEqualHighlightGeometry.test.ts` without a DOM; view-bound code stays thin wrappers here.
 */
import type {Text} from '@codemirror/state';
import {EditorView, RectangleMarker, type LayerMarker} from '@codemirror/view';

import {layerBaseOffset} from './markdownEditorLayerCoords';

/**
 * Doc range to paint for `==…==`: strip leading/trailing `==` only when they are actually there.
 */
export function equalHighlightPaintRange(
  doc: Text,
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

/** Sub-pixel / rounding slack only — large padding lets fat `forRange` rects pass clipping unchanged. */
export function equalHighlightClipMicroPadForCharWidth(cw: number): number {
  return Math.min(3, Math.max(1, cw * 0.2));
}

export function equalHighlightClipMicroPad(view: EditorView): number {
  return equalHighlightClipMicroPadForCharWidth(view.defaultCharacterWidth || 8);
}

/** Layer-space bounds per document line for the painted inner range (from `coordsAtPos`). */
export type EqualHighlightSeg = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/**
 * Horizontal bounds per document line for the painted inner range. Used to clip spurious
 * `RectangleMarker.forRange` slices that use CodeMirror's `leftSide` when a span is "open" at the
 * line edge (`rectanglesForRange` → `fromOpen ? leftSide : fromCoords.left`).
 */
export function equalHighlightExpectedSegments(
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

function pickBestEqualHighlightSegForRect(
  m: RectangleMarker,
  segs: EqualHighlightSeg[],
): {best: EqualHighlightSeg; bestOverlap: number} | null {
  const mTop = m.top;
  const mBottom = m.top + m.height;
  const mLeft = m.left;
  const mRight = m.left + m.width!;

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
  return best ? {best, bestOverlap} : null;
}

/**
 * `RectangleMarker.forRange` can emit a full-content-width “between” slice for some ranges; that
 * reads as a whole-line `==` highlight. Keep only rects whose width matches the highlighted span.
 */
export function filterEqualHighlightRectMarkers(
  scrollDOMClientWidth: number,
  defaultCharacterWidth: number,
  innerSpanChars: number,
  markers: LayerMarker[],
): LayerMarker[] {
  const cw = defaultCharacterWidth || 8;
  const generous = cw * Math.max(1, innerSpanChars) * 2.6 + 56;
  const maxW = Math.min(scrollDOMClientWidth * 0.65, Math.max(96, generous));
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

/**
 * Clip layer markers to the union of per-line segment bounds (plus `microPad`). Pure: easy to test.
 */
export function clipEqualHighlightMarkersToSegmentBounds(
  markers: LayerMarker[],
  segs: EqualHighlightSeg[],
  microPad: number,
  cls: string,
): LayerMarker[] {
  const out: LayerMarker[] = [];

  for (const m of markers) {
    if (!(m instanceof RectangleMarker) || m.width == null) {
      out.push(m);
      continue;
    }
    const picked = pickBestEqualHighlightSegForRect(m, segs);
    if (!picked || picked.bestOverlap < Math.min(4, 0.12 * m.height)) {
      continue;
    }
    const {best} = picked;
    const mLeft = m.left;
    const mRight = m.left + m.width;

    const clipL = Math.max(mLeft, best.left - microPad);
    const clipR = Math.min(mRight, best.right + microPad);
    const clipW = Math.max(0, clipR - clipL);
    if (clipW <= 0) {
      continue;
    }

    if (clipL !== mLeft || clipW !== m.width) {
      out.push(new RectangleMarker(cls, clipL, m.top, clipW, m.height));
    } else {
      out.push(m);
    }
  }

  return out;
}

export function equalHighlightSegmentEnvelopeMarkersFromSegments(
  segs: EqualHighlightSeg[],
  pad: number,
  cls: string,
): LayerMarker[] {
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

/**
 * Post-process raw `RectangleMarker.forRange` output: width filter → clip to text segments →
 * coords-only envelope if everything was dropped.
 */
export function finalizeEqualHighlightBackgroundMarkers(
  view: EditorView,
  paintFrom: number,
  paintTo: number,
  rawMarkers: LayerMarker[],
  cls: string,
): LayerMarker[] {
  let markers = filterEqualHighlightRectMarkers(
    view.scrollDOM.clientWidth,
    view.defaultCharacterWidth || 8,
    paintTo - paintFrom,
    rawMarkers,
  );
  const segs = equalHighlightExpectedSegments(view, paintFrom, paintTo);
  if (segs) {
    markers = clipEqualHighlightMarkersToSegmentBounds(
      markers,
      segs,
      equalHighlightClipMicroPad(view),
      cls,
    );
  }
  if (markers.length === 0 && segs) {
    markers = equalHighlightSegmentEnvelopeMarkersFromSegments(
      segs,
      equalHighlightClipMicroPad(view),
      cls,
    );
  }
  return markers;
}

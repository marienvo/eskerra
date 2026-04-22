import {Text} from '@codemirror/state';
import {RectangleMarker} from '@codemirror/view';
import {describe, expect, it} from 'vitest';

import {
  clipEqualHighlightMarkersToSegmentBounds,
  equalHighlightClipMicroPadForCharWidth,
  equalHighlightPaintRange,
  filterEqualHighlightRectMarkers,
} from './markdownEqualHighlightGeometry';

describe('equalHighlightPaintRange', () => {
  it('strips leading and trailing == when both present', () => {
    const doc = Text.of(['==foo==']);
    expect(equalHighlightPaintRange(doc, 0, 7)).toEqual({from: 2, to: 5});
  });

  it('returns inner slice unchanged when delimiters missing', () => {
    const doc = Text.of(['ab']);
    expect(equalHighlightPaintRange(doc, 0, 2)).toEqual({from: 0, to: 2});
  });

  it('returns full range when stripping would empty the span', () => {
    const doc = Text.of(['====']);
    expect(equalHighlightPaintRange(doc, 0, 4)).toEqual({from: 0, to: 4});
  });
});

describe('equalHighlightClipMicroPadForCharWidth', () => {
  it('stays within 1–3px', () => {
    expect(equalHighlightClipMicroPadForCharWidth(8)).toBeGreaterThanOrEqual(1);
    expect(equalHighlightClipMicroPadForCharWidth(8)).toBeLessThanOrEqual(3);
    expect(equalHighlightClipMicroPadForCharWidth(100)).toBe(3);
  });
});

describe('filterEqualHighlightRectMarkers', () => {
  it('keeps rects under the width cap', () => {
    const cls = 'cm-md-equal-highlight-bg';
    const markers = [new RectangleMarker(cls, 0, 0, 50, 10)];
    const out = filterEqualHighlightRectMarkers(800, 8, 3, markers);
    expect(out).toHaveLength(1);
    expect((out[0] as RectangleMarker).width).toBe(50);
  });

  it('drops an absurdly wide rect when a narrower sibling exists', () => {
    const cls = 'cm-md-equal-highlight-bg';
    const wide = new RectangleMarker(cls, 0, 0, 600, 10);
    const narrow = new RectangleMarker(cls, 40, 0, 48, 10);
    const out = filterEqualHighlightRectMarkers(800, 8, 3, [wide, narrow]);
    expect(out).toEqual([narrow]);
  });
});

describe('clipEqualHighlightMarkersToSegmentBounds', () => {
  const cls = 'cm-md-equal-highlight-bg';
  const microPad = 2;
  const segs = [{top: 0, bottom: 14, left: 40, right: 120}];

  it('clips a spurious full-line rect to the text segment', () => {
    const fat = new RectangleMarker(cls, 0, 0, 400, 14);
    const out = clipEqualHighlightMarkersToSegmentBounds(
      [fat],
      segs,
      microPad,
      cls,
    );
    expect(out).toHaveLength(1);
    const m = out[0] as RectangleMarker;
    expect(m.left).toBe(38);
    expect(m.width).toBe(84);
  });

  it('passes through a marker already inside the segment', () => {
    const ok = new RectangleMarker(cls, 45, 0, 70, 14);
    const out = clipEqualHighlightMarkersToSegmentBounds(
      [ok],
      segs,
      microPad,
      cls,
    );
    expect(out).toEqual([ok]);
  });
});

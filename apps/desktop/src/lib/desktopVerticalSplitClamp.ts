/**
 * Clamp top pane height (px) for a vertical flex split: top | separator | bottom.
 * Bottom pane is flexible; `minBottomPx` is a minimum reserve for the bottom pane.
 */
export function clampSplitTopHeightPx(
  px: number,
  minTopPx: number,
  maxTopPx: number,
  containerInnerHeightPx: number,
  separatorHeightPx: number,
  minBottomPx: number,
): number {
  const maxH = Math.max(
    0,
    Math.floor(containerInnerHeightPx - separatorHeightPx - minBottomPx),
  );
  let h = Math.round(px);
  h = Math.min(maxTopPx, h);
  h = Math.min(h, maxH);
  h = Math.max(minTopPx, h);
  return h;
}

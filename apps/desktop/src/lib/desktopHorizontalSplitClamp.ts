/**
 * Clamp left column width (px) for a horizontal flex split: left | separator | right.
 * Right column is flexible; `minRightPx` is a minimum reserve for the right pane.
 */
export function clampSplitLeftWidthPx(
  px: number,
  minLeftPx: number,
  maxLeftPx: number,
  containerInnerWidthPx: number,
  separatorWidthPx: number,
  minRightPx: number,
): number {
  const maxW = Math.max(
    0,
    Math.floor(containerInnerWidthPx - separatorWidthPx - minRightPx),
  );
  let w = Math.round(px);
  w = Math.min(maxLeftPx, w);
  w = Math.min(w, maxW);
  w = Math.max(minLeftPx, w);
  return w;
}

/**
 * Clamp **end** fixed column width (px): flex main | separator | end.
 * Used when the resizable panel is on the **right** (main fills remaining space).
 */
export function clampSplitRightWidthPx(
  px: number,
  minRightPx: number,
  maxRightPx: number,
  containerInnerWidthPx: number,
  separatorWidthPx: number,
  minMainPx: number,
): number {
  const maxW = Math.max(
    0,
    Math.floor(containerInnerWidthPx - separatorWidthPx - minMainPx),
  );
  let w = Math.round(px);
  w = Math.min(maxRightPx, w);
  w = Math.min(w, maxW);
  w = Math.max(minRightPx, w);
  return w;
}

/**
 * Vertical split: top | separator | bottom.
 * Bottom pane is flexible; `minBottomPx` is a minimum reserve for the bottom pane.
 */

/**
 * Max CSS pixels available for the top pane given container height and a minimum bottom reserve.
 * Matches the `maxH` step inside {@link clampSplitTopHeightPx}.
 */
export function maxAvailableTopHeightPx(
  containerInnerHeightPx: number,
  separatorHeightPx: number,
  minBottomPx: number,
): number {
  return Math.max(
    0,
    Math.floor(containerInnerHeightPx - separatorHeightPx - minBottomPx),
  );
}

/**
 * Whether to persist a clamped top height. Skips degenerate measurements (same idea as the
 * horizontal split `shouldPersistLeftSplitWidthClamp`) and transient squeezes: when the stored height does
 * not fit (`storedTopPx > maxH`) but `maxH` is only slightly above `minTopPx`, the clamp hugs the
 * minimum — often before the parent has its final height.
 */
/** Margin above `minTopPx` used to detect this squeeze (see runtime debug: maxH 129 vs minTop 120). */
export const TRANSIENT_VSPLIT_TOP_SQUEEZE_MAX_PX = 12;

export function shouldPersistVerticalSplitTopHeightClamp(
  maxAvailableTopPx: number,
  minTopPx: number,
  storedTopPx: number,
): boolean {
  if (maxAvailableTopPx < minTopPx) {
    return false;
  }
  if (
    storedTopPx > maxAvailableTopPx &&
    maxAvailableTopPx - minTopPx <= TRANSIENT_VSPLIT_TOP_SQUEEZE_MAX_PX
  ) {
    return false;
  }
  return true;
}

export function clampSplitTopHeightPx(
  px: number,
  minTopPx: number,
  maxTopPx: number,
  containerInnerHeightPx: number,
  separatorHeightPx: number,
  minBottomPx: number,
): number {
  const maxH = maxAvailableTopHeightPx(
    containerInnerHeightPx,
    separatorHeightPx,
    minBottomPx,
  );
  let h = Math.round(px);
  h = Math.min(maxTopPx, h);
  h = Math.min(h, maxH);
  h = Math.max(minTopPx, h);
  return h;
}

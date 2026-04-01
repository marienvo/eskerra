import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {clampSplitLeftWidthPx} from '../lib/desktopHorizontalSplitClamp';

export type DesktopHorizontalSplitProps = {
  /** Current left column width in CSS pixels (controlled by parent). */
  leftWidthPx: number;
  minLeftPx: number;
  maxLeftPx: number;
  /** Minimum width reserved for the right column (approximates former %-min). */
  minRightPx?: number;
  onLeftWidthPxChanged: (px: number) => void;
  left: ReactNode;
  right: ReactNode;
  className?: string;
};

/**
 * App-owned horizontal split: fixed-px left column, flex right column.
 * Avoids react-resizable-panels percentage remapping jitter on window resize.
 */
export function DesktopHorizontalSplit({
  leftWidthPx,
  minLeftPx,
  maxLeftPx,
  minRightPx = 220,
  onLeftWidthPxChanged,
  left,
  right,
  className,
}: DesktopHorizontalSplitProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const separatorRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);
  const latestDragWidthRef = useRef<number | null>(null);

  /** Local width while dragging so the parent debounce does not lag the handle. */
  const [dragWidthPx, setDragWidthPx] = useState<number | null>(null);
  const displayLeftPx = dragWidthPx ?? leftWidthPx;

  const measureAndClamp = useCallback(() => {
    const container = containerRef.current;
    const sep = separatorRef.current;
    if (!container || !sep) {
      return;
    }
    const cw = container.clientWidth;
    const sepW = sep.offsetWidth;
    if (cw <= 0) {
      return;
    }
    const next = clampSplitLeftWidthPx(
      leftWidthPx,
      minLeftPx,
      maxLeftPx,
      cw,
      sepW,
      minRightPx,
    );
    if (next !== leftWidthPx) {
      onLeftWidthPxChanged(next);
    }
  }, [leftWidthPx, minLeftPx, maxLeftPx, minRightPx, onLeftWidthPxChanged]);

  useLayoutEffect(() => {
    measureAndClamp();
  }, [measureAndClamp]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      if (draggingRef.current) {
        return;
      }
      measureAndClamp();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [measureAndClamp]);

  const onSeparatorPointerDown = useCallback(
    (e: {button: number; clientX: number; currentTarget: HTMLDivElement; pointerId: number; preventDefault: () => void}) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      draggingRef.current = true;
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = leftWidthPx;
      latestDragWidthRef.current = leftWidthPx;
      setDragWidthPx(leftWidthPx);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [leftWidthPx],
  );

  const onSeparatorPointerMove = useCallback(
    (e: {clientX: number}) => {
      if (!draggingRef.current) {
        return;
      }
      const container = containerRef.current;
      const sep = separatorRef.current;
      if (!container || !sep) {
        return;
      }
      const delta = e.clientX - dragStartXRef.current;
      const cw = container.clientWidth;
      const sepW = sep.offsetWidth;
      const next = clampSplitLeftWidthPx(
        dragStartWidthRef.current + delta,
        minLeftPx,
        maxLeftPx,
        cw,
        sepW,
        minRightPx,
      );
      latestDragWidthRef.current = next;
      setDragWidthPx(next);
    },
    [minLeftPx, maxLeftPx, minRightPx],
  );

  const endDrag = useCallback(
    (e: {currentTarget: HTMLDivElement; pointerId: number}) => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const w = latestDragWidthRef.current ?? dragStartWidthRef.current;
      latestDragWidthRef.current = null;
      setDragWidthPx(null);
      if (Number.isFinite(w)) {
        onLeftWidthPxChanged(Math.round(w));
      }
    },
    [onLeftWidthPxChanged],
  );

  const rootClass = ['panel-group', 'fill', className].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={rootClass}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        className="desktop-hsplit-left"
        style={{
          flex: `0 0 ${displayLeftPx}px`,
          width: displayLeftPx,
          minHeight: 0,
          minWidth: 0,
          maxWidth: displayLeftPx,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {left}
      </div>
      <div
        ref={separatorRef}
        className="resize-sep"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        onPointerDown={onSeparatorPointerDown}
        onPointerMove={onSeparatorPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div
        className="desktop-hsplit-right"
        style={{
          flex: '1 1 0',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {right}
      </div>
    </div>
  );
}

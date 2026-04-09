import type {EditorView} from '@codemirror/view';

/** Max pointer movement (px) between mousedown and click to prefer mousedown `posAtCoords`. */
const LINK_PRIMARY_CLICK_MAX_MOVE_PX = 8;

/** Drop stale mousedown samples so an old gesture cannot affect a later click. */
const LINK_PRIMARY_CLICK_MAX_MDOWN_TO_CLICK_MS = 800;

export type LinkPointerDownSample = {
  x: number;
  y: number;
  pos: number | null;
  timeStamp: number;
};

const lastPrimaryDownByView = new WeakMap<EditorView, LinkPointerDownSample>();

export function recordPrimaryPointerDownForLinkClick(
  view: EditorView,
  e: MouseEvent,
): void {
  if (e.button !== 0) {
    return;
  }
  lastPrimaryDownByView.set(view, {
    x: e.clientX,
    y: e.clientY,
    pos: view.posAtCoords({x: e.clientX, y: e.clientY}),
    timeStamp: e.timeStamp,
  });
}

export function discardStoredPrimaryPointerDownForLinkClick(
  view: EditorView,
): void {
  lastPrimaryDownByView.delete(view);
}

/**
 * Prefer the document position from primary mousedown when the click is the same inert gesture
 * (marker-focus line toggles `display:none` markers and would otherwise shift `posAtCoords`).
 */
export function pickDocPosForLinkPrimaryClick(
  atClick: number | null,
  click: {timeStamp: number; clientX: number; clientY: number},
  down: LinkPointerDownSample | undefined,
): number | null {
  if (down == null || down.pos == null) {
    return atClick;
  }
  if (click.timeStamp < down.timeStamp) {
    return atClick;
  }
  if (click.timeStamp - down.timeStamp > LINK_PRIMARY_CLICK_MAX_MDOWN_TO_CLICK_MS) {
    return atClick;
  }
  const dx = click.clientX - down.x;
  const dy = click.clientY - down.y;
  const max = LINK_PRIMARY_CLICK_MAX_MOVE_PX;
  if (dx * dx + dy * dy > max * max) {
    return atClick;
  }
  return down.pos;
}

export function resolveDocPositionForLinkPrimaryClick(
  view: EditorView,
  e: MouseEvent,
): number | null {
  const down = lastPrimaryDownByView.get(view);
  lastPrimaryDownByView.delete(view);
  const atClick = view.posAtCoords({x: e.clientX, y: e.clientY});
  return pickDocPosForLinkPrimaryClick(atClick, e, down);
}

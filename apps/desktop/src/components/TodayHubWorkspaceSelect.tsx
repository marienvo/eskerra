import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {useLayoutEffect, useRef, useState} from 'react';

import {MaterialIcon} from './MaterialIcon';

export type TodayHubWorkspaceSelectItem = {
  todayNoteUri: string;
  label: string;
};

type TodayHubWorkspaceSelectProps = {
  items: readonly TodayHubWorkspaceSelectItem[];
  activeTodayNoteUri: string | null;
  activeLabel: string;
  onMainActivate: () => void;
  onPickHub: (todayNoteUri: string) => void;
  /** Middle-click / aux click: open hub note in a new editor tab. */
  onOpenHubInNewTab: (todayNoteUri: string) => void;
};

export function TodayHubWorkspaceSelect({
  items,
  activeTodayNoteUri,
  activeLabel,
  onMainActivate,
  onPickHub,
  onOpenHubInNewTab,
}: TodayHubWorkspaceSelectProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const [menuAlignOffsetPx, setMenuAlignOffsetPx] = useState(0);
  const [menuMinWidthPx, setMenuMinWidthPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const main = mainRef.current;
    if (!root || !main) {
      return;
    }
    const update = () => {
      setMenuAlignOffsetPx(-main.offsetWidth);
      setMenuMinWidthPx(root.offsetWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    ro.observe(main);
    return () => {
      ro.disconnect();
    };
  }, [activeLabel, items.length]);

  if (items.length === 0 || activeTodayNoteUri == null) {
    return null;
  }

  return (
    <div ref={rootRef} className="today-hub-workspace-select" role="presentation">
      <button
        ref={mainRef}
        type="button"
        className="today-hub-workspace-select__main"
        aria-label={`Today hub: ${activeLabel}. Activate this hub.`}
        onClick={onMainActivate}
        onAuxClick={e => {
          if (e.button === 1) {
            e.preventDefault();
            onOpenHubInNewTab(activeTodayNoteUri);
          }
        }}
      >
        <MaterialIcon name="today" size={24} className="today-hub-workspace-select__icon" />
        <span className="today-hub-workspace-select__label">{activeLabel}</span>
      </button>
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="today-hub-workspace-select__chevron"
            aria-label="Choose Today hub"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MaterialIcon name="expand_more" size={24} aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="today-hub-workspace-select__menu note-list-context-menu"
            sideOffset={4}
            align="start"
            alignOffset={menuAlignOffsetPx}
            collisionPadding={8}
            style={
              menuMinWidthPx != null ? {minWidth: menuMinWidthPx} : undefined
            }
          >
            {items.map(it => (
              <DropdownMenu.Item
                key={it.todayNoteUri}
                className="note-list-context-menu__item"
                onSelect={() => {
                  onPickHub(it.todayNoteUri);
                  setMenuOpen(false);
                }}
                onPointerDown={e => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onOpenHubInNewTab(it.todayNoteUri);
                    setMenuOpen(false);
                  }
                }}
              >
                <span className="today-hub-workspace-select__menu-item-inner">
                  <MaterialIcon name="today" size={12} aria-hidden />
                  <span>{it.label}</span>
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

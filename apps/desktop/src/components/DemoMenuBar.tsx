import {useCallback, useEffect, useRef, useState} from 'react';

type MenuId = 'file' | 'edit' | 'view' | 'help';

type DemoMenuBarProps = {
  onOpenSettings: () => void;
};

export function DemoMenuBar({onOpenSettings}: DemoMenuBarProps) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (open === null) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, close]);

  const toggle = (id: MenuId) => {
    setOpen(prev => (prev === id ? null : id));
  };

  return (
    <div className="demo-menu-bar" ref={rootRef}>
      <div className="demo-menu-item">
        <button
          type="button"
          className="demo-menu-trigger"
          aria-expanded={open === 'file'}
          aria-haspopup="true"
          onClick={() => toggle('file')}
        >
          File
        </button>
        {open === 'file' ? (
          <ul className="demo-menu-dropdown" role="menu">
            <li role="none">
              <button type="button" className="demo-menu-row" role="menuitem" disabled>
                New…
              </button>
            </li>
            <li role="none">
              <button type="button" className="demo-menu-row" role="menuitem" disabled>
                Open…
              </button>
            </li>
            <li className="demo-menu-sep" role="separator" />
            <li role="none">
              <button
                type="button"
                className="demo-menu-row"
                role="menuitem"
                onClick={() => {
                  close();
                  onOpenSettings();
                }}
              >
                Settings…
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      <div className="demo-menu-item">
        <button
          type="button"
          className="demo-menu-trigger"
          aria-expanded={open === 'edit'}
          aria-haspopup="true"
          onClick={() => toggle('edit')}
        >
          Edit
        </button>
        {open === 'edit' ? (
          <ul className="demo-menu-dropdown" role="menu">
            <li role="none">
              <button type="button" className="demo-menu-row" role="menuitem" disabled>
                Undo
              </button>
            </li>
            <li role="none">
              <button type="button" className="demo-menu-row" role="menuitem" disabled>
                Redo
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      <div className="demo-menu-item">
        <button
          type="button"
          className="demo-menu-trigger"
          aria-expanded={open === 'view'}
          aria-haspopup="true"
          onClick={() => toggle('view')}
        >
          View
        </button>
        {open === 'view' ? (
          <ul className="demo-menu-dropdown" role="menu">
            <li role="none">
              <button type="button" className="demo-menu-row" role="menuitem" disabled>
                Appearance (demo)
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      <div className="demo-menu-item">
        <button
          type="button"
          className="demo-menu-trigger"
          aria-expanded={open === 'help'}
          aria-haspopup="true"
          onClick={() => toggle('help')}
        >
          Help
        </button>
        {open === 'help' ? (
          <ul className="demo-menu-dropdown" role="menu">
            <li role="none">
              <button type="button" className="demo-menu-row" role="menuitem" disabled>
                About Notebox (demo)
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </div>
  );
}

import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {useCallback, useEffect, useState} from 'react';

import logoEskerraUrl from '@notebox/brand/logo-eskerra.svg?url';

import {DemoMenuBar} from './DemoMenuBar';

type WindowTitleBarProps = {
  onOpenSettings: () => void;
};

export function WindowTitleBar({onOpenSettings}: WindowTitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const tauri = isTauri();

  const syncMaximized = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const m = await getCurrentWindow().isMaximized();
      setMaximized(m);
    } catch {
      // ignore
    }
  }, [tauri]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    queueMicrotask(() => {
      void syncMaximized();
    });
    let unlistenResize: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWindow()
      .onResized(() => {
        void syncMaximized();
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenResize = fn;
        }
      })
      .catch(() => undefined);
    const onFocus = () => {
      void syncMaximized();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      unlistenResize?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [tauri, syncMaximized]);

  const onMinimize = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().minimize();
  };

  const onToggleMaximize = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().toggleMaximize().then(() => syncMaximized());
  };

  const onClose = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().close();
  };

  return (
    <header className="window-title-bar">
      <div className="window-title-bar-leading">
        <img
          className="window-title-bar-icon"
          src={logoEskerraUrl}
          alt=""
          width={29}
          height={29}
          {...(tauri ? {'data-tauri-drag-region': true} : {})}
        />
        <DemoMenuBar onOpenSettings={onOpenSettings} />
      </div>
      <div className="window-title-bar-drag" data-tauri-drag-region />
      <div className="window-title-bar-trailing">
        {tauri ? (
          <div className="window-title-bar-controls" role="group" aria-label="Window">
            <button
              type="button"
              className="window-ctrl window-ctrl-minimize"
              onClick={onMinimize}
              title="Minimize"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <rect x="3" y="7.5" width="10" height="1.5" rx="0.5" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="window-ctrl window-ctrl-maximize"
              onClick={onToggleMaximize}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
                  <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
                </svg>
              )}
            </button>
            <button type="button" className="window-ctrl window-ctrl-close" onClick={onClose} title="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M4.35 4.35a.75.75 0 0 1 1.06 0L8 6.94l2.59-2.59a.75.75 0 1 1 1.06 1.06L9.06 8l2.59 2.59a.75.75 0 1 1-1.06 1.06L8 9.06l-2.59 2.59a.75.75 0 0 1-1.06-1.06L6.94 8 4.35 5.41a.75.75 0 0 1 0-1.06Z"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

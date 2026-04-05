import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';

import logoEskerraUrl from '@eskerra/brand/logo-eskerra.svg?url';

import type {WindowTilingState} from '../lib/windowTiling';

import {TitleBarTransport, type TitleBarTransportProps} from './TitleBarTransport';

type WindowTitleBarProps = {
  tiling?: WindowTilingState;
  transport?: TitleBarTransportProps;
};

export function WindowTitleBar({tiling = 'none', transport}: WindowTitleBarProps) {
  const tauri = isTauri();

  const onMinimize = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().minimize();
  };

  const onClose = () => {
    if (!tauri) {
      return;
    }
    void getCurrentWindow().close();
  };

  return (
    <header className="window-title-bar" data-window-tiling={tiling}>
      <div className="window-title-bar-leading">
        <img
          className="window-title-bar-icon"
          src={logoEskerraUrl}
          alt=""
          width={29}
          height={29}
          {...(tauri ? {'data-tauri-drag-region': true} : {})}
        />
      </div>
      <div className="window-title-bar-drag" aria-hidden {...(tauri ? {'data-tauri-drag-region': true} : {})} />
      {transport ? <TitleBarTransport {...transport} /> : null}
      <div className="window-title-bar-trailing">
        {tauri ? (
          <div className="window-title-bar-controls" role="group" aria-label="Window">
            <button
              type="button"
              className="window-ctrl app-tooltip-trigger window-ctrl-minimize"
              aria-label="Minimize"
              data-tooltip="Minimize"
              data-tooltip-placement="inline-start"
              onClick={onMinimize}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <rect x="3" y="7.5" width="10" height="1.5" rx="0.5" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="window-ctrl app-tooltip-trigger window-ctrl-close"
              aria-label="Close"
              data-tooltip="Close"
              data-tooltip-placement="inline-start"
              onClick={onClose}
            >
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

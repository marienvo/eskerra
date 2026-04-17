import {isTauri} from '@tauri-apps/api/core';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {lazy, Suspense, useState} from 'react';

import App from './App.tsx';
import {SETTINGS_WINDOW_LABEL} from './lib/openSettingsWindow';

const SettingsWindowApp = lazy(() =>
  import('./components/SettingsWindowApp').then(m => ({default: m.SettingsWindowApp})),
);

function initialRootView(): 'main' | 'settings' {
  if (!isTauri()) {
    return 'main';
  }
  try {
    return WebviewWindow.getCurrent().label === SETTINGS_WINDOW_LABEL ? 'settings' : 'main';
  } catch {
    return 'main';
  }
}

export function AppRoot() {
  const [view] = useState(initialRootView);

  return view === 'settings' ? (
    <Suspense fallback={null}>
      <SettingsWindowApp />
    </Suspense>
  ) : (
    <App />
  );
}

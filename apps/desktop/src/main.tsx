import './observability/registerSentry';

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import 'material-icons/iconfont/filled.css';

import '@eskerra/tokens/desktop-root.css';

import {AppRoot} from './Root.tsx';
import {ErrorBoundary} from './ErrorBoundary';
import {captureException} from './observability/sentryClient';

import './index.css';

function captureRootError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  captureException(err);
}

createRoot(document.getElementById('root')!, {
  // React 19: these fire for errors that bypass componentDidCatch (e.g. event handler throws).
  onCaughtError(error) {
    captureRootError(error);
  },
  onUncaughtError(error) {
    captureRootError(error);
  },
}).render(
  <StrictMode>
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  </StrictMode>,
);

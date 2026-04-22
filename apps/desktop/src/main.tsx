import './observability/registerSentry';

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import 'material-icons/iconfont/filled.css';

import '@eskerra/tokens/desktop-root.css';

import {AppRoot} from './Root.tsx';
import {ErrorBoundary} from './ErrorBoundary';
import {registerGlobalErrorHandlers} from './observability/registerGlobalErrorHandlers';
import {reportCrash} from './observability/reportCrash';

import './index.css';

registerGlobalErrorHandlers();

type ReactErrorInfo = {componentStack?: string | null};

createRoot(document.getElementById('root')!, {
  onCaughtError(error, info: ReactErrorInfo) {
    reportCrash('react-caught', error, {componentStack: info?.componentStack ?? null});
  },
  onUncaughtError(error, info: ReactErrorInfo) {
    reportCrash('react-uncaught', error, {componentStack: info?.componentStack ?? null});
  },
}).render(
  <StrictMode>
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  </StrictMode>,
);

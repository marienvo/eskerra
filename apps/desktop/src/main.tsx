import './observability/registerSentry';

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import '@fontsource-variable/inter';
import 'material-icons/iconfont/filled.css';

import '@eskerra/tokens/desktop-root.css';

import {AppRoot} from './Root.tsx';
import {ErrorBoundary} from './ErrorBoundary';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  </StrictMode>,
);

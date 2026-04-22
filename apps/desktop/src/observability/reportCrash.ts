import {captureException, withScope} from '@sentry/react';
import {invoke, isTauri} from '@tauri-apps/api/core';

import {isObservabilityDisabled} from './env';

export type CrashSource =
  | 'react-error-boundary'
  | 'react-caught'
  | 'react-uncaught'
  | 'window.error'
  | 'unhandledrejection';

export type CrashExtra = {
  componentStack?: string | null;
};

/**
 * Single entry point for unexpected crashes. Logs to console, Sentry, and an on-disk log file.
 * Safe to call even when Sentry is not initialized or when running outside Tauri (tests, storybook).
 */
export function reportCrash(
  source: CrashSource,
  error: unknown,
  extra?: CrashExtra,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const componentStack = extra?.componentStack ?? null;

  console.error(`[eskerra:${source}]`, err, componentStack ? `\nComponent stack:${componentStack}` : '');

  withScope(scope => {
    scope.setTag('crashSource', source);
    if (componentStack) {
      scope.setExtra('componentStack', componentStack);
    }
    captureException(err);
  });

  if (isObservabilityDisabled() || !isTauri()) {
    return;
  }

  void invoke('eskerra_append_crash_log', {
    record: {
      source,
      timestamp: new Date().toISOString(),
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
      componentStack,
      userAgent: navigator.userAgent,
    },
  }).catch(e => {
    console.warn('[eskerra:crash-log] failed to append:', e);
  });
}

export function formatCrashDetails(error: Error, componentStack: string | null): string {
  const lines = [
    `${error.name}: ${error.message}`,
    '',
    'Stack:',
    error.stack ?? '(no stack)',
  ];
  if (componentStack) {
    lines.push('', 'Component stack:', componentStack.trim());
  }
  return lines.join('\n');
}

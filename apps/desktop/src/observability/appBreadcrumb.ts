import * as Sentry from '@sentry/react';

import {isObservabilityDisabled} from './env';

export type AppBreadcrumbInput = {
  category: string;
  message: string;
  level?: 'info' | 'error' | 'warning';
  data?: Record<string, unknown>;
};

/**
 * Adds a Sentry breadcrumb when the client is initialized.
 */
export function appBreadcrumb(input: AppBreadcrumbInput): void {
  const level = input.level ?? 'info';
  if (isObservabilityDisabled() || !Sentry.getClient()) {
    return;
  }
  Sentry.addBreadcrumb({
    category: input.category,
    message: input.message,
    level,
    data: input.data,
  });
}

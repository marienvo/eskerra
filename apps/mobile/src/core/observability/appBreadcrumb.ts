import {addBreadcrumb, getClient} from '@sentry/react-native';

import {isObservabilityDisabled} from './env';
import {enqueueRingLine} from './ringBuffer';

export type AppBreadcrumbInput = {
  category: string;
  message: string;
  level?: 'info' | 'error';
  data?: Record<string, unknown>;
};

/**
 * Adds a Sentry breadcrumb and mirrors the same line to the local ring buffer.
 */
export function appBreadcrumb(input: AppBreadcrumbInput): void {
  const level = input.level ?? 'info';
  if (!isObservabilityDisabled() && getClient()) {
    addBreadcrumb({
      category: input.category,
      message: input.message,
      level,
      data: input.data,
    });
  }
  enqueueRingLine({
    ts: Date.now(),
    level,
    category: input.category,
    message: input.message,
    data: input.data,
  });
}

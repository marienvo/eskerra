import {SENTRY_DSN as SentryDsnFromEnv} from '@env';

/**
 * Client DSN for Sentry (Events API). Set `SENTRY_DSN` in the repository root `.env`
 * (copy from `.env.example`). Empty string skips Sentry initialization.
 */
export const SENTRY_DSN =
  typeof SentryDsnFromEnv === 'string' ? SentryDsnFromEnv.trim() : '';

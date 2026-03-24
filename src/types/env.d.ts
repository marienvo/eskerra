declare module '@env' {
  /**
   * Sentry client DSN for the Events API. Set in root `.env` (see `.env.example`).
   */
  export const SENTRY_DSN: string | undefined;
}

import {InteractionManager} from 'react-native';

/**
 * Handle returned when deferring work until after UI settles.
 * Mirrors React Native's cancelable from `InteractionManager.runAfterInteractions`.
 */
export type RunAfterInteractionsHandle = {
  cancel: () => void;
};

type IdleDeadline = {didTimeout: boolean; timeRemaining: () => number};

type SchedulingGlobals = typeof globalThis & {
  requestIdleCallback?: (cb: (deadline: IdleDeadline) => void, opts?: {timeout?: number}) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Prefer `requestIdleCallback` when available (avoids deprecated `InteractionManager` on newer RN
 * and matches RN guidance). Falls back to `InteractionManager.runAfterInteractions` elsewhere.
 */
export function runAfterInteractions(task: () => void): RunAfterInteractionsHandle {
  const g = globalThis as SchedulingGlobals;
  if (typeof g.requestIdleCallback === 'function' && typeof g.cancelIdleCallback === 'function') {
    const id = g.requestIdleCallback(
      () => {
        task();
      },
      {timeout: 500},
    );
    return {
      cancel: () => {
        g.cancelIdleCallback!(id);
      },
    };
  }
  return InteractionManager.runAfterInteractions(task);
}

import {useEffect, useState} from 'react';

/**
 * Shows a pending UI only after `delayMs` while `loading` stays true, so fast
 * operations do not flash a loading state. When `loading` becomes false, the
 * indicator hides immediately.
 */
export function useDeferredLoadingIndicator(loading: boolean, delayMs: number): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      return;
    }
    const id = window.setTimeout(() => {
      setShow(true);
    }, delayMs);
    return () => {
      window.clearTimeout(id);
      setShow(false);
    };
  }, [loading, delayMs]);

  return show;
}

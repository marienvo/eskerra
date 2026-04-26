import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {scheduleTryConsumeAndroidShareNavigation} from './androidShareIntentHandlers';

/** When returning from another app after [onNewIntent], consume share if vault is ready. */
export function AndroidShareIntentBridge() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        scheduleTryConsumeAndroidShareNavigation();
      }
      appState.current = next;
    });
    return () => {
      sub.remove();
    };
  }, []);

  return null;
}

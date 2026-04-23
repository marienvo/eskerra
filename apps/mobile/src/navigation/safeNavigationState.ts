import type {NavigationState, PartialState} from '@react-navigation/native';

type NavigationWithOptionalGetState = {
  getState?: () => NavigationState | PartialState<NavigationState> | undefined;
} | null | undefined;

/**
 * `navigation.getState()` can throw or be unavailable briefly during Fabric/Hermes
 * gesture teardown (see REACT-NATIVE-D). Use this before reading stack state.
 */
export function safeNavigationState(
  navigation: NavigationWithOptionalGetState,
): NavigationState | PartialState<NavigationState> | null {
  if (navigation == null || typeof navigation.getState !== 'function') {
    return null;
  }
  try {
    return navigation.getState() ?? null;
  } catch {
    return null;
  }
}

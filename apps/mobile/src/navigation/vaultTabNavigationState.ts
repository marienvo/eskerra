import type {NavigationState} from '@react-navigation/native';

/**
 * True when the Vault tab stack is showing the root `Vault` screen (Today hub home), not search or a
 * note reader — used to show week navigation above the tab bar.
 */
export function vaultStackRouteIsVaultHome(
  vaultTabState: NavigationState | undefined,
): boolean {
  if (!vaultTabState?.routes?.length) {
    /**
     * Nested stack state is absent on the first lazy visit to VaultTab; the stack
     * still initializes at the `Vault` route, so treat as home (week nav caller
     * already gates on `activeTabName === 'VaultTab'`).
     */
    return true;
  }
  const idx = vaultTabState.index ?? 0;
  const route = vaultTabState.routes[idx];
  return route?.name === 'Vault';
}

/**
 * Reads nested vault stack state from the root navigation state when the active tab is Vault.
 */
export function vaultStackStateFromRootState(
  rootState: NavigationState | undefined,
): NavigationState | undefined {
  if (!rootState?.routes?.length) {
    return undefined;
  }
  const tabIdx = rootState.index ?? 0;
  const tabRoute = rootState.routes[tabIdx];
  if (tabRoute?.name !== 'VaultTab') {
    return undefined;
  }
  const nested = tabRoute.state as NavigationState | undefined;
  return nested;
}

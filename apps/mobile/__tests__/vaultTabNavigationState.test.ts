import type {NavigationState} from '@react-navigation/native';

import {
  vaultStackRouteIsVaultHome,
  vaultStackStateFromRootState,
} from '../src/navigation/vaultTabNavigationState';

function navState(routes: {name: string; state?: NavigationState}[], index: number): NavigationState {
  return {
    index,
    key: 'root',
    routeNames: routes.map(r => r.name),
    routes: routes.map((r, i) => ({
      key: `${r.name}-${i}`,
      name: r.name,
      ...(r.state ? {state: r.state} : {}),
    })),
    stale: false,
    type: 'stack',
  };
}

describe('vaultStackRouteIsVaultHome', () => {
  it('is true when top route is Vault', () => {
    expect(
      vaultStackRouteIsVaultHome(
        navState([{name: 'Vault'}], 0),
      ),
    ).toBe(true);
  });

  it('is false when top route is VaultSearch', () => {
    expect(
      vaultStackRouteIsVaultHome(
        navState([{name: 'Vault'}, {name: 'VaultSearch'}], 1),
      ),
    ).toBe(false);
  });

  it('is true for undefined state (lazy stack not hydrated yet)', () => {
    expect(vaultStackRouteIsVaultHome(undefined)).toBe(true);
  });

  it('is true when routes array is empty (unhydrated)', () => {
    expect(
      vaultStackRouteIsVaultHome({
        index: 0,
        key: 'vault',
        routeNames: [],
        routes: [],
        stale: false,
        type: 'stack',
      }),
    ).toBe(true);
  });
});

describe('vaultStackStateFromRootState', () => {
  it('returns nested vault stack when Vault tab is active', () => {
    const vaultStack = navState([{name: 'Vault'}], 0);
    const root = navState(
      [
        {name: 'PodcastsTab'},
        {name: 'VaultTab', state: vaultStack},
        {name: 'InboxTab'},
      ],
      1,
    );
    expect(vaultStackStateFromRootState(root)).toBe(vaultStack);
  });

  it('returns undefined when another tab is active', () => {
    const root = navState(
      [
        {name: 'PodcastsTab'},
        {name: 'VaultTab', state: navState([{name: 'Vault'}], 0)},
      ],
      0,
    );
    expect(vaultStackStateFromRootState(root)).toBeUndefined();
  });
});

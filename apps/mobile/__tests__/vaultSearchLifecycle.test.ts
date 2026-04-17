import {
  canonicalizeVaultBaseUriForSearch,
  fullNeedsRebuild,
  shouldReconcile,
  VAULT_SEARCH_RECONCILE_MAX_AGE_MS,
  VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION,
  vaultSearchBaseUriHash,
} from '../src/features/vault/vaultSearchLifecycle';

function status(partial: Partial<Parameters<typeof fullNeedsRebuild>[0]>) {
  return {
    vaultInstanceId: 'id',
    baseUriHash: 'abc',
    schemaVersion: VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION,
    indexReady: true,
    isBuilding: false,
    indexedNotes: 10,
    lastFullBuildAt: 1000,
    lastReconciledAt: 5000,
    ...partial,
  };
}

describe('vaultSearchLifecycle', () => {
  test('canonicalizeVaultBaseUriForSearch strips trailing slash', () => {
    expect(canonicalizeVaultBaseUriForSearch('content://tree/x/')).toBe('content://tree/x');
  });

  test('vaultSearchBaseUriHash is stable hex for a canonical uri', () => {
    const h = vaultSearchBaseUriHash('content://tree/v');
    expect(h).toMatch(/^[0-9a-f]{40}$/);
    expect(vaultSearchBaseUriHash('content://tree/v')).toBe(h);
  });

  test('fullNeedsRebuild when schema mismatches', () => {
    expect(fullNeedsRebuild(status({schemaVersion: 0}), 'content://tree/v')).toBe(true);
  });

  test('fullNeedsRebuild when base uri hash drifts', () => {
    expect(
      fullNeedsRebuild(
        status({baseUriHash: 'deadbeef', indexReady: true}),
        'content://tree/v',
      ),
    ).toBe(true);
  });

  test('fullNeedsRebuild when index not ready and not building', () => {
    expect(fullNeedsRebuild(status({indexReady: false, isBuilding: false}), 'content://tree/v')).toBe(
      true,
    );
  });

  test('fullNeedsRebuild false when ready', () => {
    const canonical = 'content://tree/v';
    const h = vaultSearchBaseUriHash(canonicalizeVaultBaseUriForSearch(canonical));
    expect(fullNeedsRebuild(status({baseUriHash: h, indexReady: true}), canonical)).toBe(false);
  });

  test('shouldReconcile when last reconciled is old', () => {
    const now = 100_000;
    expect(
      shouldReconcile(
        status({lastReconciledAt: now - VAULT_SEARCH_RECONCILE_MAX_AGE_MS - 1}),
        now,
      ),
    ).toBe(true);
  });

  test('shouldReconcile false when index not ready', () => {
    expect(shouldReconcile(status({indexReady: false}), 999)).toBe(false);
  });

  test('shouldReconcile false when within max age', () => {
    const now = 100_000;
    expect(
      shouldReconcile(
        status({lastReconciledAt: now - VAULT_SEARCH_RECONCILE_MAX_AGE_MS + 1000}),
        now,
      ),
    ).toBe(false);
  });
});

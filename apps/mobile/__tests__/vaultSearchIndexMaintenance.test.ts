/**
 * @format
 */
jest.mock('../src/core/observability', () => ({
  appBreadcrumb: jest.fn(),
}));

import {
  requestVaultSearchIndexWarmup,
  runVaultSearchIndexMaintenance,
} from '../src/features/vault/vaultSearchIndexMaintenance';
import {
  canonicalizeVaultBaseUriForSearch,
  vaultSearchBaseUriHash,
} from '../src/features/vault/vaultSearchLifecycle';

const TEST_URI = 'content://tree/v';
const TEST_URI_HASH = vaultSearchBaseUriHash(canonicalizeVaultBaseUriForSearch(TEST_URI));

jest.mock('../src/native/eskerraVaultSearch', () => ({
  eskerraVaultSearch: {
    isAvailable: () => true,
    getIndexStatus: jest.fn(),
    open: jest.fn(),
    persistActiveVaultUriForWorker: jest.fn(() => Promise.resolve()),
    reconcile: jest.fn(() => Promise.resolve()),
    scheduleFullRebuild: jest.fn(() => Promise.resolve()),
  },
}));

const mod = jest.requireMock('../src/native/eskerraVaultSearch');
const eskerraVaultSearch = mod.eskerraVaultSearch;

const readyStatus = {
  baseUriHash: TEST_URI_HASH,
  indexedNotes: 1,
  indexReady: true,
  isBuilding: false,
  lastFullBuildAt: 1,
  lastReconciledAt: Number.MAX_SAFE_INTEGER,
  schemaVersion: 3,
  vaultInstanceId: 'v1',
};

describe('vaultSearchIndexMaintenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eskerraVaultSearch.open.mockResolvedValue(readyStatus);
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(readyStatus);
  });

  test('runVaultSearchIndexMaintenance calls open and getIndexStatus', async () => {
    await runVaultSearchIndexMaintenance(TEST_URI);

    expect(eskerraVaultSearch.open).toHaveBeenCalledWith(TEST_URI);
    expect(eskerraVaultSearch.getIndexStatus).toHaveBeenCalledWith(TEST_URI);
  });

  test('schedules full rebuild when index not ready and not building', async () => {
    const notReady = {
      baseUriHash: '',
      indexedNotes: 0,
      indexReady: false,
      isBuilding: false,
      lastFullBuildAt: 0,
      lastReconciledAt: 0,
      schemaVersion: 3,
      vaultInstanceId: 'v1',
    };
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(notReady);

    const afterRebuild = {...notReady, indexReady: true, lastFullBuildAt: 1, vaultInstanceId: 'v2'};
    eskerraVaultSearch.open.mockReset();
    eskerraVaultSearch.open.mockResolvedValueOnce(notReady).mockResolvedValueOnce(afterRebuild);

    await runVaultSearchIndexMaintenance(TEST_URI);

    expect(eskerraVaultSearch.scheduleFullRebuild).toHaveBeenCalledWith(TEST_URI, 'missing');
    expect(eskerraVaultSearch.open).toHaveBeenCalledTimes(2);
  });

  test('reconcile when index ready and stale', async () => {
    const stale = {
      ...readyStatus,
      lastReconciledAt: 0,
    };
    eskerraVaultSearch.open.mockResolvedValue(stale);
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(stale);

    await runVaultSearchIndexMaintenance(TEST_URI);

    expect(eskerraVaultSearch.reconcile).toHaveBeenCalledWith(TEST_URI);
  });

  test('schema v3 persisted partial index reconciles instead of full rebuild', async () => {
    const partial = {
      baseUriHash: TEST_URI_HASH,
      indexedNotes: 12,
      indexReady: false,
      isBuilding: false,
      lastFullBuildAt: 1,
      lastReconciledAt: 0,
      schemaVersion: 3,
      vaultInstanceId: 'v-partial',
    };
    eskerraVaultSearch.open.mockResolvedValue(partial);
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(partial);

    const result = await runVaultSearchIndexMaintenance(TEST_URI);

    expect(eskerraVaultSearch.scheduleFullRebuild).not.toHaveBeenCalled();
    expect(eskerraVaultSearch.reconcile).toHaveBeenCalledWith(TEST_URI);
    expect(result?.vaultInstanceId).toBe('v-partial');
    expect(result?.indexedNotes).toBe(12);
  });

  test('concurrent calls for same URI share one in-flight run', async () => {
    let resolveOpen;
    eskerraVaultSearch.open.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveOpen = resolve;
        }),
    );
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(readyStatus);

    const p1 = runVaultSearchIndexMaintenance(TEST_URI);
    const p2 = runVaultSearchIndexMaintenance(TEST_URI);
    resolveOpen(readyStatus);
    await Promise.all([p1, p2]);

    expect(eskerraVaultSearch.open).toHaveBeenCalledTimes(1);
  });

  test('requestVaultSearchIndexWarmup is a no-op for empty or null uri', () => {
    jest.clearAllMocks();
    requestVaultSearchIndexWarmup(null);
    requestVaultSearchIndexWarmup('');
    requestVaultSearchIndexWarmup('   ');
    expect(eskerraVaultSearch.open).not.toHaveBeenCalled();
  });
});

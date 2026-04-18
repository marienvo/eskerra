/**
 * @format
 */
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
    reconcile: jest.fn(() => Promise.resolve()),
    scheduleFullRebuild: jest.fn(() => Promise.resolve()),
  },
}));

const {eskerraVaultSearch} = jest.requireMock('../src/native/eskerraVaultSearch') as {
  eskerraVaultSearch: {
    getIndexStatus: jest.Mock;
    open: jest.Mock;
    reconcile: jest.Mock;
    scheduleFullRebuild: jest.Mock;
  };
};

const readyStatus = {
  baseUriHash: TEST_URI_HASH,
  indexedNotes: 1,
  indexReady: true,
  isBuilding: false,
  lastFullBuildAt: 1,
  lastReconciledAt: Number.MAX_SAFE_INTEGER,
  schemaVersion: 1,
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
      schemaVersion: 1,
      vaultInstanceId: 'v1',
    };
    eskerraVaultSearch.open.mockResolvedValue(notReady);
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(notReady);

    await runVaultSearchIndexMaintenance(TEST_URI);

    expect(eskerraVaultSearch.scheduleFullRebuild).toHaveBeenCalledWith(TEST_URI, 'missing');
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

  test('concurrent calls for same URI share one in-flight run', async () => {
    let resolveOpen!: (v: typeof readyStatus) => void;
    eskerraVaultSearch.open.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveOpen = resolve;
        }),
    );
    eskerraVaultSearch.getIndexStatus.mockResolvedValue(readyStatus);

    const p1 = runVaultSearchIndexMaintenance(TEST_URI);
    const p2 = runVaultSearchIndexMaintenance(TEST_URI);
    resolveOpen!(readyStatus);
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

/* eslint-env jest, node */
/** Set before any test file so app code can skip long deferred timers without relying on inlined env. */
global.__NOTEBOX_JEST__ = true;

/**
 * Single AsyncStorage mock for the whole Jest run. Per-file jest.mock factories race for "first
 * registration" across workers; an incomplete mock breaks hooks that need setItem (for example
 * usePodcasts persisted-index + background reconcile).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    clear: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    getItem: jest.fn(() => Promise.resolve(null)),
    mergeItem: jest.fn(() => Promise.resolve()),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiMerge: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
    multiSet: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));

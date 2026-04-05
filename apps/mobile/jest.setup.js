/* eslint-env jest, node */
/** Set before any test file so app code can skip long deferred timers without relying on inlined env. */
global.__ESKERRA_JEST__ = true;

/**
 * Do not use `react-native-reanimated/mock`: it imports the real `index`, which pulls in native
 * worklets and breaks Jest. This stub covers app usage (startup splash + Podcasts header strip).
 */
jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const NOOP = () => {};
  const ID = t => t;
  const {View, Text, Image} = ReactNative;
  const {Animated: AnimatedRN} = ReactNative;

  const useSharedValue = init => {
    const target = {value: init};
    return new Proxy(target, {
      get(tr, prop) {
        if (prop === 'value') {
          return tr.value;
        }
        if (prop === 'get') {
          return () => tr.value;
        }
        if (prop === 'set') {
          return v => {
            tr.value = typeof v === 'function' ? v(tr.value) : v;
          };
        }
      },
      set(tr, prop, v) {
        if (prop === 'value') {
          tr.value = v;
          return true;
        }
        return false;
      },
    });
  };

  return {
    __esModule: true,
    cancelAnimation: NOOP,
    default: {
      View,
      Text,
      Image,
      ScrollView: AnimatedRN.ScrollView,
      FlatList: AnimatedRN.FlatList,
      createAnimatedComponent: ID,
    },
    Easing: {
      linear: ID,
      ease: ID,
      cubic: ID,
      inOut: f => f,
      out: f => f,
    },
    runOnJS: ID,
    runOnUI: ID,
    useAnimatedStyle: fn => (typeof fn === 'function' ? fn() : {}),
    useFrameCallback: () => ({
      callbackId: 0,
      isActive: false,
      setActive: jest.fn(),
    }),
    useReducedMotion: () => false,
    useSharedValue,
    withRepeat: ID,
    withSpring: (to, _cfg, cb) => {
      cb?.(true);
      return to;
    },
    withTiming: (to, _cfg, cb) => {
      cb?.(true);
      return to;
    },
  };
});

jest.mock('react-native-keyboard-controller', () => {
  const {View} = require('react-native');
  return {
    KeyboardProvider: ({children}) => children,
    KeyboardAvoidingView: View,
    KeyboardStickyView: View,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}) => children,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

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

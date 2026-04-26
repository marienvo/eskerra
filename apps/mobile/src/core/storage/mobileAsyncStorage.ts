import AsyncStorage from '@react-native-async-storage/async-storage';

/** Key-value persistence for mobile; wraps AsyncStorage so features avoid direct native imports. */
export const mobileAsyncStorage = AsyncStorage;

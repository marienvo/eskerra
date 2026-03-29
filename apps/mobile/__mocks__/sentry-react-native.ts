/**
 * Jest stub so importing @sentry/react-native does not initialize native code.
 */
const noop = (): void => undefined;

export const init = noop;
export const addBreadcrumb = noop;
export const captureException = noop;
export const captureMessage = jest.fn();
export const getClient = (): null => null;
export const withScope = (
  cb: (scope: {setTag: typeof noop; setExtra: typeof noop}) => void,
): void => cb({setTag: noop, setExtra: noop});
export const setContext = noop;

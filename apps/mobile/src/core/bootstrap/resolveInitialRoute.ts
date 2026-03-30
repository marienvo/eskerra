import {Platform} from 'react-native';
import {hasPermission} from 'react-native-saf-x';

import {appBreadcrumb} from '../observability/appBreadcrumb';
import {elapsedMsSinceJsBundleEval} from '../observability/startupTiming';
import {clearUri, getSavedUri} from '../storage/appStorage';

export type InitialRoute = 'MainTabs' | 'Setup';
export type ResolvedInitialRoute = {
  route: InitialRoute;
  savedUri: string | null;
};
const isDevMockVaultEnabled =
  __DEV__ &&
  !(globalThis as {process?: {env?: Record<string, string | undefined>}}).process
    ?.env?.JEST_WORKER_ID;

function bootstrapComplete(route: InitialRoute): InitialRoute {
  appBreadcrumb({
    category: 'app',
    message: 'app.bootstrap.complete',
    data: {
      route,
      elapsed_ms: elapsedMsSinceJsBundleEval(),
    },
  });
  return route;
}

export async function resolveInitialRoute(): Promise<ResolvedInitialRoute> {
  if (isDevMockVaultEnabled) {
    const savedUri = await getSavedUri();
    appBreadcrumb({
      category: 'app',
      message: 'app.bootstrap.start',
      data: {mock: true},
    });
    return {route: bootstrapComplete('MainTabs'), savedUri};
  }

  appBreadcrumb({
    category: 'app',
    message: 'app.bootstrap.start',
    data: {mock: false},
  });

  try {
    const savedUri = await getSavedUri();

    if (!savedUri) {
      return {route: bootstrapComplete('Setup'), savedUri: null};
    }

    if (Platform.OS !== 'android') {
      return {route: bootstrapComplete('MainTabs'), savedUri};
    }

    const permissionGranted = await hasPermission(savedUri);

    if (!permissionGranted) {
      await clearUri();
      return {route: bootstrapComplete('Setup'), savedUri: null};
    }

    return {route: bootstrapComplete('MainTabs'), savedUri};
  } catch (error) {
    appBreadcrumb({
      category: 'app',
      message: 'app.bootstrap.fail',
      level: 'error',
      data: {},
    });
    throw error;
  }
}

import {Platform} from 'react-native';
import {hasPermission} from 'react-native-saf-x';

import {appBreadcrumb} from '../observability/appBreadcrumb';
import {elapsedMsSinceJsBundleEval} from '../observability/startupTiming';
import {clearUri, getSavedUri} from '../storage/appStorage';

export type InitialRoute = 'MainTabs' | 'Setup';
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

export async function resolveInitialRoute(): Promise<InitialRoute> {
  if (isDevMockVaultEnabled) {
    appBreadcrumb({
      category: 'app',
      message: 'app.bootstrap.start',
      data: {mock: true},
    });
    return bootstrapComplete('MainTabs');
  }

  appBreadcrumb({
    category: 'app',
    message: 'app.bootstrap.start',
    data: {mock: false},
  });

  try {
    const savedUri = await getSavedUri();

    if (!savedUri) {
      return bootstrapComplete('Setup');
    }

    if (Platform.OS !== 'android') {
      return bootstrapComplete('MainTabs');
    }

    const permissionGranted = await hasPermission(savedUri);

    if (!permissionGranted) {
      await clearUri();
      return bootstrapComplete('Setup');
    }

    return bootstrapComplete('MainTabs');
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

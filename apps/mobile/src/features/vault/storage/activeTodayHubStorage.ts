import {mobileAsyncStorage} from '../../../core/storage/mobileAsyncStorage';

const MOBILE_ACTIVE_TODAY_HUB_URI_KEY = 'eskerra.mobile.activeTodayHubUri';

export async function loadPersistedActiveTodayHubUri(): Promise<string | null> {
  const raw = await mobileAsyncStorage.getItem(MOBILE_ACTIVE_TODAY_HUB_URI_KEY);
  const v = raw?.trim();
  return v && v.length > 0 ? v : null;
}

export async function persistActiveTodayHubUri(uri: string): Promise<void> {
  await mobileAsyncStorage.setItem(MOBILE_ACTIVE_TODAY_HUB_URI_KEY, uri);
}

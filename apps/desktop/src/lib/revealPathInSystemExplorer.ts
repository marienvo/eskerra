import {isTauri} from '@tauri-apps/api/core';
import {revealItemInDir} from '@tauri-apps/plugin-opener';

/** Reveals a filesystem path in the OS file manager (desktop Tauri only). */
export async function revealPathInSystemExplorer(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('revealPathInSystemExplorer requires the Tauri desktop runtime.');
  }
  await revealItemInDir(path);
}

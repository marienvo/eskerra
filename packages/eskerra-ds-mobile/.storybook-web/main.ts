import path from 'node:path';
import {fileURLToPath} from 'node:url';

import type {StorybookConfig} from '@storybook/react-native-web-vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const storybookConfigDir = path.dirname(fileURLToPath(import.meta.url));
const mobilePackageRoot = path.resolve(storybookConfigDir, '..');

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {},
  },
  viteFinal: async (cfg) => {
    // @storybook/react-native-web-vite adds vite-tsconfig-paths with eager discovery
    // across the whole monorepo, which parses broken vendor tsconfigs (e.g. Tauri plugins).
    cfg.plugins = (cfg.plugins ?? []).flatMap((entry) => {
      const plugin = Array.isArray(entry) ? entry[0] : entry;
      if (
        plugin &&
        typeof plugin === 'object' &&
        'name' in plugin &&
        plugin.name === 'vite-tsconfig-paths'
      ) {
        return [
          tsconfigPaths({
            root: mobilePackageRoot,
            projects: ['tsconfig.json'],
          }),
        ];
      }
      return [entry];
    });
    cfg.optimizeDeps = cfg.optimizeDeps ?? {};
    cfg.optimizeDeps.include = [...(cfg.optimizeDeps.include ?? []), '@eskerra/tokens'];
    return cfg;
  },
};

export default config;

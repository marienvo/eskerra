import type {StorybookConfig} from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (cfg) => {
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string>),
      'react-native': 'react-native-web',
    };
    cfg.optimizeDeps = cfg.optimizeDeps ?? {};
    cfg.optimizeDeps.include = [...(cfg.optimizeDeps.include ?? []), 'react-native-web', '@eskerra/tokens'];
    return cfg;
  },
};

export default config;

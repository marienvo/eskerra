const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const withStorybook = require('@storybook/react-native/metro/withStorybook');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
  },
};

const merged = mergeConfig(getDefaultConfig(projectRoot), config);

const storybookConfigPath = path.resolve(
  monorepoRoot,
  'packages/eskerra-ds-mobile/.storybook',
);

const storybookMetro = withStorybook(merged, {
  enabled: process.env.WITH_STORYBOOK === '1',
  configPath: storybookConfigPath,
  onDisabledRemoveStorybook: true,
});

function isStorybookAppEntry(moduleName) {
  if (process.env.WITH_STORYBOOK !== '1' || typeof moduleName !== 'string') {
    return false;
  }
  const norm = (p) => path.normalize(p);
  const m = norm(moduleName);
  return ['index.js', 'index', 'index.android.js', 'index.ios.js']
    .map((f) => norm(path.resolve(projectRoot, f)))
    .includes(m);
}

const innerResolve = storybookMetro.resolver?.resolveRequest;

module.exports = {
  ...storybookMetro,
  resolver: {
    ...storybookMetro.resolver,
    resolveRequest(context, moduleName, platform) {
      if (isStorybookAppEntry(moduleName)) {
        return {
          type: 'sourceFile',
          filePath: path.resolve(projectRoot, 'index.storybook.js'),
        };
      }
      if (innerResolve) {
        return innerResolve(context, moduleName, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

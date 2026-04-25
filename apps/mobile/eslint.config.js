const js = require('@eslint/js');
const reactNativeConfig = require('@react-native/eslint-config/flat').filter(
  config => !config.plugins?.['ft-flow']
);
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh').default;
const sonarjs = require('eslint-plugin-sonarjs');
const tseslint = require('typescript-eslint');
const {defineConfig, globalIgnores} = require('eslint/config');

module.exports = defineConfig([
  globalIgnores(['android/app/build/**', 'android/build/**']),
  ...reactNativeConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.recommended,
      sonarjs.configs.recommended,
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
    },
  },
]);

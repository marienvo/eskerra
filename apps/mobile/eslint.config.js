const js = require('@eslint/js');
const globals = require('globals');
const reactNativeConfig = require('@react-native/eslint-config/flat').filter(
  config => !config.plugins?.['ft-flow']
);
const reactRefresh = require('eslint-plugin-react-refresh').default;
const sonarjs = require('eslint-plugin-sonarjs');
const {defineConfig, globalIgnores} = require('eslint/config');

module.exports = defineConfig([
  globalIgnores(['android/app/build/**', 'android/build/**']),
  ...reactNativeConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactRefresh.configs.recommended,
      sonarjs.configs.recommended,
    ],
  },
  {
    files: [
      'jest.setup.js',
      'jest.setupAfterEnv.js',
      '__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__mocks__/**/*.{js,jsx,ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message:
                'Import mobileAsyncStorage from src/core/storage/mobileAsyncStorage instead.',
            },
            {
              name: 'react-native-saf-x',
              message:
                'Import openAndroidVaultDirectoryPicker from src/core/storage/openAndroidDocumentTree instead.',
            },
          ],
          patterns: [
            {
              group: ['**/dev/**', '**/dev/*'],
              message:
                'Do not import from src/dev from feature modules; use src/core or src/native adapters.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*Context.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/features/vault/markdown/vaultReadonlyMarkdownRules.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
    },
  },
]);

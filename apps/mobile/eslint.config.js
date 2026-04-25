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
    files: ['src/**/*Context.{ts,tsx}'],
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

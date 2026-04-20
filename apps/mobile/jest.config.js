module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setupAfterEnv.js'],
  moduleNameMapper: {
    '^@gluestack-ui/themed$': '<rootDir>/__mocks__/gluestackThemed.tsx',
    '^@sentry/react-native$': '<rootDir>/__mocks__/sentry-react-native.ts',
    '^@env$': '<rootDir>/__mocks__/env.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|react-native-reanimated|react-native-keyboard-controller|@gluestack-ui/.*|@gluestack-style/.*|@legendapp/.*|yaml))',
  ],
};

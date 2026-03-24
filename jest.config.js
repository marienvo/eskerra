module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@gluestack-ui/themed$': '<rootDir>/__mocks__/gluestackThemed.tsx',
    '^@sentry/react-native$': '<rootDir>/__mocks__/sentry-react-native.ts',
    '^@env$': '<rootDir>/__mocks__/env.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|@gluestack-ui/.*|@gluestack-style/.*|@legendapp/.*))',
  ],
};

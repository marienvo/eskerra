module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@gluestack-ui/themed$': '<rootDir>/__mocks__/gluestackThemed.tsx',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|@gluestack-ui/.*|@gluestack-style/.*|@legendapp/.*))',
  ],
};

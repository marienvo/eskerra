module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      [
        'module:react-native-dotenv',
        {
          moduleName: '@env',
          path: '.env',
          allowUndefined: true,
          // Never expose build secrets to the JS bundle, even if imported by mistake.
          blocklist: ['SENTRY_AUTH_TOKEN'],
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};

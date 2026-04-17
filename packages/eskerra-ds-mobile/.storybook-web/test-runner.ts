import type {TestRunnerConfig} from '@storybook/test-runner';

const config: TestRunnerConfig = {
  tags: {
    skip: ['native-only'],
  },
};

export default config;

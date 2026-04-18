import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: false,
    unstubGlobals: true,
    unstubEnvs: true,
    isolate: true,
    sequence: {hooks: 'list'},
  },
});

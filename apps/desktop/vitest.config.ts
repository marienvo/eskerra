import {mergeConfig} from 'vite';
import {defineConfig} from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: ['./vitest.setup.ts'],
      clearMocks: true,
      /** Do not use `restoreMocks`: it resets `vi.mock()` factories and breaks hoisted module mocks. */
      restoreMocks: false,
      unstubGlobals: true,
      unstubEnvs: true,
      isolate: true,
      sequence: {hooks: 'list'},
    },
  }),
);

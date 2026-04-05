import {readFileSync} from 'node:fs';
import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const desktopPkg = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
) as {version: string};

// https://vite.dev/config/
export default defineConfig({
  define: {
    __DESKTOP_APP_VERSION__: JSON.stringify(desktopPkg.version),
  },
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@eskerra/core': path.resolve(__dirname, '../../packages/eskerra-core/src'),
      '@eskerra/brand': path.resolve(__dirname, '../../assets/brand'),
    },
  },
});

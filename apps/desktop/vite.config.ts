import {readFileSync} from 'node:fs';
import path from 'node:path';
import {sentryVitePlugin} from '@sentry/vite-plugin';
import {visualizer} from 'rollup-plugin-visualizer';
import {defineConfig, type PluginOption} from 'vite';
import react from '@vitejs/plugin-react';

const mobilePkg = JSON.parse(
  readFileSync(path.join(__dirname, '../mobile/package.json'), 'utf8'),
) as {version: string};

const sentryAuth = process.env.SENTRY_AUTH_TOKEN?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();

const sentryPlugins: PluginOption[] = [];
if (sentryAuth && sentryOrg && sentryProject) {
  sentryPlugins.push(
    sentryVitePlugin({
      org: sentryOrg,
      project: sentryProject,
      authToken: sentryAuth,
    }),
  );
}

const analyzeBundle = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';
const analyzePlugins: PluginOption[] = [];
if (analyzeBundle) {
  analyzePlugins.push(
    visualizer({
      /** Written next to `dist/` output; open in a browser after `npm run build:analyze`. */
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  );
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __DESKTOP_APP_VERSION__: JSON.stringify(mobilePkg.version),
  },
  plugins: [react(), ...analyzePlugins, ...sentryPlugins],
  /** Tauri loads assets from disk; the main chunk is ~1.7 MB minified (CodeMirror, Radix, remark, fonts). */
  build: {
    chunkSizeWarningLimit: 2048,
  },
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

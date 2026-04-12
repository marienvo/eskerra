import {readFileSync} from 'node:fs';
import path from 'node:path';
import {sentryVitePlugin} from '@sentry/vite-plugin';
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

// https://vite.dev/config/
export default defineConfig({
  define: {
    __DESKTOP_APP_VERSION__: JSON.stringify(mobilePkg.version),
  },
  plugins: [react(), ...sentryPlugins],
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

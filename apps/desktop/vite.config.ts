import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@notebox/core': path.resolve(__dirname, '../../packages/notebox-core/src'),
      '@notebox/brand': path.resolve(__dirname, '../../assets/brand'),
    },
  },
});

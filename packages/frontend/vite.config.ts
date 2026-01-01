import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@colonies/core': path.resolve(__dirname, '../core/src'),
      '@colonies/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@colonies/core', '@colonies/shared'],
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
});

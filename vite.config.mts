import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    css: true,
  },
});

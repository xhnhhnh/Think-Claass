import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/qa-full-site.spec.ts', '**/*.pw.spec.ts', '**/*.e2e.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: [],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '__tests__/', '*.test.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@wasm4pm/testing': path.resolve(__dirname, './src'),
    },
  },
});

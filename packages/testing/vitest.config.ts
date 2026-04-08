import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: [],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@wasm4pm/testing': path.resolve(__dirname, './src'),
    },
  },
  // Use happy-dom for tests that need DOM (XML parsing)
  environmentOptions: {
    // Note: To enable DOM for specific tests, use vi.stubEnv('browser', true)
  },
});

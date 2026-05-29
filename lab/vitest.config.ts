import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    isolate: true,
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    reporters: ['default'],
    outputFile: {
      json: './reports/test-results.json',
      html: './reports/test-results.html',
    },
    server: {
      deps: {
        inline: ['wasm4pm', '@wasm4pm/core'],
      },
    },
  },
});

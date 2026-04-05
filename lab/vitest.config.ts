import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
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
  },
});

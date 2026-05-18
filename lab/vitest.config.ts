import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 15000,
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

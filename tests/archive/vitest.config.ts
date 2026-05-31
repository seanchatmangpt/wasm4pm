import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    isolate: true,
    testTimeout: 120000,   // 120s — archive lane is nightly/manual, not release-blocking
    hookTimeout: 30000,
    include: ['pre-reset/**/*.test.ts'],
    passWithNoTests: true,
  },
});

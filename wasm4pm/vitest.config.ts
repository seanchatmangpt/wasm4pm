import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['__tests__/**/*.test.*'],
    },
    testTimeout: 30000,
    browser: {
      provider: 'playwright',
      headless: true,
      instances: [
        {
          browser: 'chromium',
        },
      ],
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['adversarial-wvda.bench.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});

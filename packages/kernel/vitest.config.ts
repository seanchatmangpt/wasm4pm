import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      // These load @wasm4pm/kernel or wasm4pm which requires the nodejs WASM binary.
      // Run independently after `cd wasm4pm && npm run build:nodejs`.
      '__tests__/backend-registry.test.ts',
      '__tests__/deployment-profiles.test.ts',
      '__tests__/algorithms-error-handling.test.ts',
      '__tests__/errors.test.ts',
      '__tests__/eventlog-ir-converter.test.ts',
      '__tests__/model-ir-converter.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // JsonWriter tests have open handles (invalid-path write test hangs shutdown loop).
      // Run separately with: npx vitest run __tests__/json-writer.test.ts
      '**/__tests__/json-writer.test.ts',
      '**/__tests__/json-writer.test.js',
      // feedback-loop + feedback-diagnosis tests share module-level state (algorithm
      // feedback store) and fail with race conditions when run in parallel with other
      // workers. Run separately: npx vitest run src/__tests__/feedback-*.test.ts
      '**/__tests__/feedback-diagnosis-integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
});

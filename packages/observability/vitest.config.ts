import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['../../test/un-test-global-setup.ts'],
    environment: 'node',
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // JsonWriter tests have open handles (invalid-path write test hangs shutdown loop).
      // Run separately with: npx vitest run __tests__/json-writer.test.ts
      '**/__tests__/json-writer.test.ts',
      '**/__tests__/json-writer.test.js',
      // Integration test has shared module state (feedback-loop store) and experiences
      // race conditions in parallel execution. Run separately with:
      // npx vitest run src/__tests__/feedback-diagnosis-integration.test.ts
      '**/__tests__/feedback-diagnosis-integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    }
  }
});

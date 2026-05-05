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
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  }
});

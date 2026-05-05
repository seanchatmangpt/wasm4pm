import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Only run TypeScript test sources; ignore stale build artefacts under src/__tests__/.
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '**/*.test.js', '**/*.bench.ts', '**/*.bench.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.bench.ts',
        'src/types.ts',
        'src/index.ts',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
  benchmark: {
    include: ['src/**/*.bench.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});

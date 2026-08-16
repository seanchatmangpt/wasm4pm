import { defineConfig, configDefaults } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    environment: 'node',
    globals: true,
    globalSetup: './src/__tests__/global-setup.ts',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60_000,
    // Combinatorial-maximalism suites are deliberately excluded from the
    // default `vitest run` (what CI's `pnpm test` invokes) — they are a
    // local/on-demand deep-verification layer, not a CI gate. Run them via
    // `pnpm test:combinatorial` (vitest.combinatorial.config.ts).
    exclude: [...configDefaults.exclude, '**/*.combinatorial.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', '**/*.test.ts', '__tests__/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});

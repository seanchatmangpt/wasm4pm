import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.js'],
    setupFiles: ['__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      // NOTE: Rust code in pkg/wasm4pm_bg.wasm is not measurable by v8 coverage.
      // These thresholds apply to the TypeScript client layer (src/*.ts).
      include: ['src/**/*.ts'],
      exclude: ['src/mcp_server.ts', 'node_modules/**', 'pkg/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
    testTimeout: 30000,
    browser: {
      provider: 'playwright',
      headless: true,
      name: 'chromium',
    },
  },
});

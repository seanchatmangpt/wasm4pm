/**
 * vitest.unit.config.ts — Unit-only vitest config, no WASM global setup.
 * Used for pure TypeScript tests that have zero WASM dependency.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // No globalSetup — these tests do not require the WASM nodejs binary.
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.unit.test.ts', 'src/__tests__/trace-conformance.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    environment: 'node',
    globals: true,
    isolate: true,        // WASM singleton safety — REQUIRED, do not change
    testTimeout: 6000,    // 6s per-test cap: WASM binary load (~500ms idle, ~4s under load)
    hookTimeout: 2000,
    pool: 'threads',
    include: ['**/*.proof.ts'],
  },
});

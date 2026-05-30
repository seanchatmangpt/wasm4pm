import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    environment: 'node',
    globals: true,
    isolate: true,        // WASM singleton safety — REQUIRED, do not change
    testTimeout: 4000,    // hard 4s per-test cap; proof files must be fast
    hookTimeout: 1000,
    pool: 'threads',
    include: ['**/*.proof.ts'],
  },
});

import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,      // parity/determinism run 5 iterations; CLI tests spawn child procs
    hookTimeout: 15000,      // temp dir setup/cleanup
    isolate: true,           // WASM singleton must not bleed between scenario files
    pool: 'forks',           // process-level isolation for WASM
    include: ['scenarios/**/*.ts'],
    exclude: ['node_modules', 'helpers/**', 'scenarios/**/*.d.ts'],
    reporters: ['verbose'],
    sequence: { shuffle: false }, // numbered prefix ordering is intentional
  },
});

import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

// Local/on-demand deep-verification suite: combinatorial coverage over
// multi-breed `wpm compile --run` composition and the process-mining
// algorithm matrix. Deliberately NOT run by CI (see vitest.config.ts's
// `test.exclude`, which excludes these same files from the default
// `pnpm test`). Run via `pnpm test:combinatorial`.
export default defineConfig({
  plugins: [wasm()],
  test: {
    environment: 'node',
    globals: true,
    globalSetup: './src/__tests__/global-setup.ts',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 120_000,
    include: ['src/__tests__/**/*.combinatorial.integration.test.ts'],
  },
});

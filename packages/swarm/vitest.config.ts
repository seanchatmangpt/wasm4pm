import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^(\.\.?\/.*?)\.js$/, replacement: '$1.ts' },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '__tests__/', '*.test.ts'],
    },
  },
});

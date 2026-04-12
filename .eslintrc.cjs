/**
 * ESLint Configuration — pictl monorepo
 * Gemba Enforcement: Test purity, quality gates, process mining standards
 */

module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    project: ['./tsconfig.json'],
  },
  plugins: [
    '@typescript-eslint',
    'pictl-testing', // Custom rule plugin for Gemba enforcement
    'pictl-observability', // Custom rule plugin for OTEL coverage
  ],
  rules: {
    // OTEL Coverage Enforcement: all public functions must emit spans
    'pictl-observability/require-span-for-public': 'warn',

    // Gemba Enforcement: no mocks in integration tests
    'pictl-testing/no-mocks-in-integration': 'error',

    // TypeScript strictness
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',

    // Quality gates
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    'no-debugger': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'eqeqeq': ['error', 'always'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
  },

  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      env: { node: true, jest: true },
      rules: {
        'pictl-testing/no-mocks-in-integration': 'error',
      },
    },
    {
      files: ['**/*.unit.test.ts', '**/*.spec.ts'],
      rules: {
        // Unit tests CAN use mocks (rule doesn't apply to .unit.test.ts)
        'pictl-testing/no-mocks-in-integration': 'off',
      },
    },
    {
      // Fixtures and mock helpers are exempt
      files: ['packages/testing/src/mocks/**/*', 'packages/testing/src/fixtures/**/*'],
      rules: {
        'pictl-testing/no-mocks-in-integration': 'off',
      },
    },
    {
      files: ['**/*.integration.test.ts', '**/*.e2e.test.ts', '__tests__/integration/**/*.test.ts'],
      rules: {
        // Integration tests must be pure (no mocks)
        'pictl-testing/no-mocks-in-integration': 'error',
      },
    },
  ],

  // Ignore patterns
  ignorePatterns: [
    'dist/',
    'build/',
    'coverage/',
    'node_modules/',
    '*.config.js',
    '*.config.cjs',
    '.next/',
    'out/',
  ],
};

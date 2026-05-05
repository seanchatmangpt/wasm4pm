/**
 * ESLint Plugin: wasm4pm-observability
 *
 * Custom rules for OTEL span coverage enforcement.
 * Loaded via .eslintrc.cjs as 'wasm4pm-observability'
 *
 * Rules:
 * - require-span-for-public: Enforces Instrumentation calls on public functions
 */

const requireSpanForPublic = require('./eslint-rules/require-span-for-public.js');

module.exports = {
  rules: {
    'require-span-for-public': requireSpanForPublic,
  },
};

/**
 * ESLint Plugin: pictl-observability
 *
 * Custom rules for OTEL span coverage enforcement.
 * Loaded via .eslintrc.cjs as 'pictl-observability'
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

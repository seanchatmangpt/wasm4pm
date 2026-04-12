/**
 * ESLint Custom Rules for pictl
 * Gemba Enforcement: Quality gates to prevent happy-path testing
 */

module.exports = {
  'no-mocks-in-integration': require('./no-mocks-in-integration.js'),
};

/**
 * ESLint Plugin: pictl-testing
 * Exports custom rules for Gemba enforcement and test quality gates
 */

const noMocksInIntegration = require('./eslint-rules/no-mocks-in-integration.js');

module.exports = {
  rules: {
    'no-mocks-in-integration': noMocksInIntegration,
  },
};

#!/usr/bin/env node
/**
 * validate-test-purity.mjs
 * Gemba Enforcement: Validate test purity (integration tests have no mocks)
 *
 * Categorizes tests and reports violations:
 * - Integration tests (must be pure, no mocks)
 * - Unit tests (can have mocks)
 * - E2E tests (must be pure, no mocks)
 *
 * Exit codes:
 *   0 = all tests pure (no violations)
 *   1 = violations found (integration tests with mocks)
 */

import fs from 'fs';
import path from 'path';
import glob from 'glob';

const REPO_ROOT = process.cwd();

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function categorizeTest(filePath) {
  if (filePath.includes('.integration.test.ts')) return 'integration';
  if (filePath.includes('.e2e.test.ts')) return 'e2e';
  if (filePath.includes('__tests__/integration/')) return 'integration';
  if (filePath.includes('.unit.test.ts')) return 'unit';
  if (filePath.includes('.spec.ts')) return 'unit';
  return 'unknown';
}

function hasMocks(content) {
  const mockPatterns = [
    /\bvi\.mock\s*\(/,
    /\bvi\.stub\s*\(/,
    /\bvi\.stubGlobal\s*\(/,
    /\bvi\.spyOn\s*\(/,
    /\bjest\.mock\s*\(/,
    /\bjest\.spyOn\s*\(/,
    /\bsinon\.stub\s*\(/,
    /\btd\.replace\s*\(/,
    /\.mockImplementation\s*\(/,
    /\.mockReturnValue\s*\(/,
    /\.mockResolvedValue\s*\(/,
    /\.mockRejectedValue\s*\(/,
    /\.returns\s*\(/,
  ];

  return mockPatterns.some(pattern => pattern.test(content));
}

function main() {
  const testFiles = glob.sync('**/*.test.ts', {
    cwd: REPO_ROOT,
    ignore: ['node_modules', 'dist', 'build', 'coverage', '.next'],
  });

  const categories = {
    integration: { files: [], violations: [], verified: [] },
    e2e: { files: [], violations: [], verified: [] },
    unit: { files: [], violations: [], verified: [] },
    unknown: { files: [], violations: [], verified: [] },
  };

  log('Validating test purity (Gemba enforcement)...', 'cyan');
  log('', 'reset');

  // Categorize and check tests
  testFiles.forEach(testFile => {
    const fullPath = path.join(REPO_ROOT, testFile);
    const category = categorizeTest(testFile);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const hasMockUsage = hasMocks(content);

    categories[category].files.push(testFile);

    // Integration/E2E tests must be pure (no mocks)
    if ((category === 'integration' || category === 'e2e') && hasMockUsage) {
      categories[category].violations.push(testFile);
    } else if (category === 'integration' || category === 'e2e') {
      categories[category].verified.push(testFile);
    }
  });

  // Report by category
  log('Integration Tests:', 'blue');
  log(`  Total: ${categories.integration.files.length}`, 'reset');
  log(`  Verified (pure): ${categories.integration.verified.length}`, 'green');
  if (categories.integration.violations.length > 0) {
    log(`  Violations: ${categories.integration.violations.length}`, 'red');
    categories.integration.violations.forEach(file => {
      log(`    - ${file}`, 'red');
    });
  }

  log('', 'reset');
  log('E2E Tests:', 'blue');
  log(`  Total: ${categories.e2e.files.length}`, 'reset');
  log(`  Verified (pure): ${categories.e2e.verified.length}`, 'green');
  if (categories.e2e.violations.length > 0) {
    log(`  Violations: ${categories.e2e.violations.length}`, 'red');
    categories.e2e.violations.forEach(file => {
      log(`    - ${file}`, 'red');
    });
  }

  log('', 'reset');
  log('Unit Tests:', 'blue');
  log(`  Total: ${categories.unit.files.length} (mocks allowed)`, 'reset');

  // Summary
  log('', 'reset');
  const totalViolations = categories.integration.violations.length + categories.e2e.violations.length;
  const totalVerified = categories.integration.verified.length + categories.e2e.verified.length;

  if (totalViolations === 0) {
    log('✓ [PASS] Test purity check passed', 'green');
    log(`  ${totalVerified} integration/E2E tests verified as pure (no mocks)`, 'green');
    process.exit(0);
  } else {
    log(`✗ [FAIL] Test purity violations found: ${totalViolations}`, 'red');
    log('', 'reset');
    log('Integration/E2E tests must use real WASM/APIs per Gemba principle.', 'yellow');
    log('Fix by:', 'yellow');
    log('  1. Remove mock setup (vi.mock, vi.stub, jest.mock, etc.)', 'yellow');
    log('  2. Or move to a unit test (*.unit.test.ts or *.spec.ts)', 'yellow');
    log('  3. Or use real implementations in the integration test', 'yellow');
    process.exit(1);
  }
}

main();

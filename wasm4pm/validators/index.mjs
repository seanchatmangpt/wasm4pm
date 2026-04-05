#!/usr/bin/env node
/**
 * Unified Validator Index
 * Aggregates all validators and generates comprehensive report
 *
 * Usage:
 *   import { runAllValidators } from './index.mjs';
 *   const report = await runAllValidators();
 *
 * Or: node validators/index.mjs [--output report.json]
 */

import { validateCLI } from './cli.mjs';
import { validateHTTP } from './http.mjs';
import { validateWebSocket } from './websocket.mjs';
import { validateObservability } from './observability.mjs';
import { validateIO } from './io.mjs';
import { validatePerformance } from './performance.mjs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runAllValidators(config = {}) {
  const {
    httpBaseUrl = 'http://localhost:3000',
    wsBaseUrl = 'ws://localhost:3000',
    outputFile = null,
  } = config;

  console.log('\n✨ Running comprehensive validation suite...\n');

  const results = {
    metadata: {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      version: '26.4.5',
    },
    validators: {},
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
    },
  };

  // Run each validator
  const validators = [
    { name: 'CLI', fn: () => validateCLI() },
    { name: 'HTTP', fn: () => validateHTTP(httpBaseUrl) },
    { name: 'WebSocket', fn: () => validateWebSocket(wsBaseUrl) },
    { name: 'Observability', fn: () => validateObservability() },
    { name: 'I/O', fn: () => validateIO() },
    { name: 'Performance', fn: () => validatePerformance() },
  ];

  for (const validator of validators) {
    try {
      console.log(`Running ${validator.name} validation...`);
      const result = await validator.fn();
      results.validators[validator.name] = result;

      results.summary.total += result.summary.total;
      results.summary.passed += result.summary.passed;
      results.summary.failed += result.summary.failed;

      console.log(`  ✓ ${result.summary.passed}/${result.summary.total} passed\n`);
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}\n`);
      results.validators[validator.name] = {
        surface: validator.name,
        error: error.message,
        tests: [],
        summary: { total: 0, passed: 0, failed: 1 },
      };
      results.summary.failed++;
    }
  }

  // Generate summary report
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTotal Tests: ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Success Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);

  console.log('\nValidation Status by Surface:');
  Object.entries(results.validators).forEach(([name, result]) => {
    const rate = result.summary.total > 0
      ? ((result.summary.passed / result.summary.total) * 100).toFixed(1)
      : 'N/A';
    console.log(`  ${name}: ${result.summary.passed}/${result.summary.total} (${rate}%)`);
  });

  // Write output file if requested
  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n✅ Report written to ${outputFile}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  return results;
}

// Run standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      config.outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--http' && args[i + 1]) {
      config.httpBaseUrl = args[i + 1];
      i++;
    } else if (args[i] === '--ws' && args[i + 1]) {
      config.wsBaseUrl = args[i + 1];
      i++;
    }
  }

  const results = await runAllValidators(config);
  process.exit(results.summary.failed > 0 ? 1 : 0);
}

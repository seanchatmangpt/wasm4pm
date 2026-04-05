#!/usr/bin/env node
/**
 * CLI Validator Module
 * Validates pmctl command-line interface
 *
 * Usage:
 *   import { validateCLI } from './cli.mjs';
 *   const results = await validateCLI();
 *
 * Or: node validators/cli.mjs
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runCmd(cmd) {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    return { code: 0, output, error: null };
  } catch (e) {
    return { code: e.status || 1, output: e.stdout || '', error: e.stderr || e.message };
  }
}

export async function validateCLI() {
  const tests = [];

  // Test 1: Help command
  const help = runCmd('pmctl --help');
  tests.push({
    name: 'pmctl --help works',
    pass: help.code === 0,
    code: help.code,
  });

  // Test 2: Version command
  const version = runCmd('pmctl --version');
  tests.push({
    name: 'pmctl --version returns version',
    pass: version.code === 0 && version.output.includes('26.4.5'),
    code: version.code,
  });

  // Test 3: List algorithms
  const list = runCmd('pmctl list-algorithms');
  tests.push({
    name: 'pmctl list-algorithms shows algorithms',
    pass: list.code === 0,
    code: list.code,
  });

  // Test 4: Explain algorithm
  const explain = runCmd('pmctl explain dfg');
  tests.push({
    name: 'pmctl explain <algorithm> works',
    pass: explain.code === 0,
    code: explain.code,
  });

  // Test 5: Exit codes
  const notFound = runCmd('pmctl run /nonexistent/file.xes');
  tests.push({
    name: 'pmctl returns exit code 2 for missing file',
    pass: notFound.code === 2,
    code: notFound.code,
  });

  return {
    surface: 'CLI',
    timestamp: new Date().toISOString(),
    tests,
    summary: {
      total: tests.length,
      passed: tests.filter(t => t.pass).length,
      failed: tests.filter(t => !t.pass).length,
    },
  };
}

// Run standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await validateCLI();
  console.log(`\n🧪 CLI Validation\n`);
  results.tests.forEach(t => {
    console.log(`${t.pass ? '✓' : '✗'} ${t.name}`);
  });
  console.log(`\nPassed: ${results.summary.passed}/${results.summary.total}\n`);
  process.exit(results.summary.failed > 0 ? 1 : 0);
}

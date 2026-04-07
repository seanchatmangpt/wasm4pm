#!/usr/bin/env node

/**
 * wasm4pm health check
 * Verifies environment, WASM build, and basic functionality
 */

import { access, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const checks = [];

function ok(name) {
  checks.push({ name, status: 'ok' });
  console.log(`  ✓ ${name}`);
}

function fail(name, reason) {
  checks.push({ name, status: 'fail', reason });
  console.log(`  ✗ ${name}: ${reason}`);
}

function warn(name, reason) {
  checks.push({ name, status: 'warn', reason });
  console.log(`  ⚠ ${name}: ${reason}`);
}

async function main() {
  console.log('wasm4pm health check\n');

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
  if (nodeMajor >= 18) {
    ok(`Node.js ${nodeVersion} (>=18)`);
  } else {
    fail(`Node.js ${nodeVersion}`, 'requires >=18');
  }

  // 2. pnpm
  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    const pnpmMajor = parseInt(pnpmVersion.split('.')[0], 10);
    if (pnpmMajor >= 8) {
      ok(`pnpm ${pnpmVersion} (>=8)`);
    } else {
      fail(`pnpm ${pnpmVersion}`, 'requires >=8');
    }
  } catch {
    warn('pnpm', 'not found in PATH');
  }

  // 3. WASM package
  const wasmPkgDir = join(rootDir, 'wasm4pm', 'pkg');
  try {
    await access(wasmPkgDir);
    const files = await readdir(wasmPkgDir);
    const hasWasm = files.some((f) => f.endsWith('.wasm'));
    if (hasWasm) {
      ok('WASM built (pkg/ exists with .wasm files)');
    } else {
      warn('WASM pkg/ exists but has no .wasm files — run: pnpm build:wasm');
    }
  } catch {
    fail('WASM not built', 'run: pnpm build:wasm');
  }

  // 4. Git hooks
  const preCommitPath = join(rootDir, '.git', 'hooks', 'pre-commit');
  try {
    await access(preCommitPath);
    ok('Git pre-commit hook installed');
  } catch {
    warn('Git pre-commit hook missing', 'run: pnpm prepare');
  }

  // 5. TypeScript compilation (quick check)
  try {
    execSync('npx tsc --noEmit', { cwd: rootDir, encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    ok('TypeScript type check passes');
  } catch (err) {
    warn('TypeScript type check', 'has errors — run: pnpm lint for details');
  }

  // 6. Uncommitted changes
  try {
    const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
    const lines = status.trim().split('\n').filter((l) => l);
    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      ok('No uncommitted changes');
    } else {
      warn('Uncommitted changes', `${lines.length} file(s) changed`);
    }
  } catch {
    warn('Git status', 'not a git repository or git not available');
  }

  // Summary
  const okCount = checks.filter((c) => c.status === 'ok').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  console.log(`\n${okCount} passed, ${warnCount} warnings, ${failCount} failures`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});

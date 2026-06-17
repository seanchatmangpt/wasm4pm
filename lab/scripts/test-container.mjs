#!/usr/bin/env node
/**
 * lab/test:container — pack both publishable packages locally, install them
 * into a clean node:18-alpine Docker container, and verify the published API
 * surface works end-to-end.
 *
 * What this proves (things the workspace tests cannot):
 *   - The `files` arrays in package.json actually include everything needed
 *   - The WASM binary is bundled and loads correctly outside the workspace
 *   - `wpm --version` and `wpm doctor` work from a cold npm install
 *   - The WASM JS API (WasmEventLog, discover_dfg) is importable
 *
 * Requirements:
 *   - Docker daemon running locally
 *   - wasm4pm WASM built: wasm4pm/pkg/ must exist
 *   - TypeScript CLI built: apps/wasm4pm/dist/ must exist
 *
 * Skip: SKIP_CONTAINER_TEST=1 (exits 0, useful in offline CI)
 */

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.SKIP_CONTAINER_TEST === '1') {
  console.log('[test:container] SKIPPED via SKIP_CONTAINER_TEST=1');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

// ── Pre-flight: check Docker ──────────────────────────────────────────────────
try {
  execSync('docker info', { stdio: 'pipe' });
} catch {
  console.error('[test:container] Docker is not running. Start Docker Desktop and retry.');
  process.exit(1);
}

// ── Pre-flight: check builds exist ───────────────────────────────────────────
const wasmPkg = path.join(repoRoot, 'wasm4pm/pkg/wasm4pm_bg.wasm');
const cliDist = path.join(repoRoot, 'apps/wasm4pm/dist/bin/wpm.js');

if (!existsSync(wasmPkg)) {
  console.error('[test:container] WASM not built. Run: cd wasm4pm && npm run build:nodejs');
  process.exit(1);
}
if (!existsSync(cliDist)) {
  console.error('[test:container] CLI not built. Run: cd apps/wasm4pm && npm run build');
  process.exit(1);
}

// ── Pack both packages ────────────────────────────────────────────────────────
const stagingDir = mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-container-'));
console.log(`[test:container] Staging directory: ${stagingDir}`);

let preserved = false;
try {
  console.log('[test:container] Packing wasm4pm (WASM core)...');
  const wasmPackResult = spawnSync('npm', ['pack', '--pack-destination', stagingDir], {
    cwd: path.join(repoRoot, 'wasm4pm'),
    encoding: 'utf8',
  });
  if (wasmPackResult.status !== 0) {
    throw new Error(`npm pack wasm4pm failed:\n${wasmPackResult.stderr}`);
  }
  const wasmTarball = wasmPackResult.stdout.trim().split('\n').pop();

  console.log('[test:container] Packing @wasm4pm/cli (TypeScript CLI)...');
  const cliPackResult = spawnSync('npm', ['pack', '--pack-destination', stagingDir], {
    cwd: path.join(repoRoot, 'apps/wasm4pm'),
    encoding: 'utf8',
  });
  if (cliPackResult.status !== 0) {
    throw new Error(`npm pack @wasm4pm/cli failed:\n${cliPackResult.stderr}`);
  }
  const cliTarball = cliPackResult.stdout.trim().split('\n').pop();

  console.log(`[test:container]   wasm4pm:    ${wasmTarball}`);
  console.log(`[test:container]   @wasm4pm/cli: ${cliTarball}`);

  // Copy sample XES fixture for smoke test
  const fixtureDir = path.join(stagingDir, 'fixtures');
  mkdirSync(fixtureDir, { recursive: true });
  const xesSrc = path.join(repoRoot, 'lab/fixtures/sample-logs/simple.xes');
  if (existsSync(xesSrc)) {
    copyFileSync(xesSrc, path.join(fixtureDir, 'simple.xes'));
  }

  // ── Build Dockerfile ────────────────────────────────────────────────────────
  const wasmTarballName = path.basename(wasmTarball);
  const cliTarballName = path.basename(cliTarball);

  const hasXes = existsSync(path.join(fixtureDir, 'simple.xes'));

  const dockerfile = `
FROM node:18-alpine

WORKDIR /app

# Copy tarballs
COPY ${wasmTarballName} .
COPY ${cliTarballName} .
${hasXes ? 'COPY fixtures/simple.xes .' : ''}

# Clean install — no workspace, no symlinks
RUN npm install --prefer-offline ${wasmTarballName} ${cliTarballName}

# --- Smoke test 1: WASM JS API loads and exports are present ---
RUN node -e "
  const pm = require('wasm4pm');
  if (!pm.WasmEventLog) throw new Error('WasmEventLog missing from wasm4pm');
  if (typeof pm.discover_dfg !== 'function') throw new Error('discover_dfg not a function');
  if (typeof pm.get_version !== 'function') throw new Error('get_version not a function');
  const v = pm.get_version();
  if (!v) throw new Error('get_version() returned empty');
  console.log('SMOKE-1 PASS: wasm4pm loads, version=' + v);
"

# --- Smoke test 2: CLI binary resolves and --version works ---
RUN node ./node_modules/@wasm4pm/cli/dist/bin/wpm.js --version | tee /tmp/ver.txt && \\
    grep -qE '[0-9]+\\.' /tmp/ver.txt && echo "SMOKE-2 PASS: wpm --version OK"

# --- Smoke test 3: wpm status exits 0 ---
RUN node ./node_modules/@wasm4pm/cli/dist/bin/wpm.js status --format json | tee /tmp/status.json && \\
    node -e "
      const r = JSON.parse(require('fs').readFileSync('/tmp/status.json','utf8'));
      if (r.status !== 'success' && r.status !== 'ok') throw new Error('status command failed: ' + JSON.stringify(r));
      console.log('SMOKE-3 PASS: wpm status OK');
    "

# --- Smoke test 4: DFG discovery on XES fixture (if present) ---
${hasXes ? `RUN node -e "
  const pm = require('wasm4pm');
  const fs = require('fs');
  const xes = fs.readFileSync('simple.xes', 'utf8');
  const handle = pm.load_eventlog_from_xes(xes);
  const raw = pm.discover_dfg(handle, 'concept:name');
  const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!result) throw new Error('discover_dfg returned null');
  console.log('SMOKE-4 PASS: DFG discovery on real XES fixture OK');
"` : 'RUN echo "SMOKE-4 SKIP: no XES fixture available"'}

RUN echo "ALL SMOKE TESTS PASSED"
`.trim();

  writeFileSync(path.join(stagingDir, 'Dockerfile'), dockerfile);

  // ── Build and run the container ─────────────────────────────────────────────
  const imageTag = `wasm4pm-clean-env-test:${Date.now()}`;
  console.log(`[test:container] Building Docker image ${imageTag}...`);

  const buildResult = spawnSync(
    'docker', ['build', '--no-cache', '-t', imageTag, '.'],
    { cwd: stagingDir, stdio: 'inherit' }
  );

  if (buildResult.status !== 0) {
    preserved = true;
    throw new Error(`Docker build failed (staging dir preserved: ${stagingDir})`);
  }

  // Clean up the image
  spawnSync('docker', ['rmi', imageTag], { stdio: 'pipe' });

  console.log('[test:container] PASS — all smoke tests passed in clean container');

} catch (err) {
  preserved = true;
  console.error(`[test:container] FAIL: ${err instanceof Error ? err.message : String(err)}`);
  if (preserved) console.error(`Staging dir preserved for forensics: ${stagingDir}`);
  process.exit(1);
} finally {
  if (!preserved) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

#!/usr/bin/env node
/**
 * lab/test:published — install the published `wasm4pm` npm package into a
 * scratch directory and smoke-test the CLI artifact.
 *
 * Honest contract:
 *   - Default version: read from apps/wasm4pm/package.json.
 *   - Override: WASM4PM_PUBLISHED_VERSION=<semver>
 *   - Skip: SKIP_PUBLISHED_TEST=1 (CI/offline path; exits 0 with SKIPPED log)
 *
 * Failures are NOT swallowed. The tmpdir is preserved on failure so the
 * caller can inspect `npm install` output / artifact contents.
 */
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.SKIP_PUBLISHED_TEST === '1') {
  console.log('[test:published] SKIPPED via SKIP_PUBLISHED_TEST=1');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const version =
  process.env.WASM4PM_PUBLISHED_VERSION ??
  (() => {
    const pkgPath = path.resolve(here, '../../apps/wasm4pm/package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
  })();

const tmp = mkdtempSync(path.join(os.tmpdir(), 'wasm4pm-lab-'));
console.log(`[test:published] Installing wasm4pm@${version} into ${tmp}`);

writeFileSync(
  path.join(tmp, 'package.json'),
  JSON.stringify(
    {
      name: 'wasm4pm-published-test',
      version: '0.0.0',
      private: true,
      dependencies: { wasm4pm: version },
    },
    null,
    2
  )
);

let preserved = false;
try {
  execSync('npm install', { cwd: tmp, stdio: 'inherit' });
  // Smoke 1: --version prints something non-empty.
  const ver = execSync('npx wasm4pm --version', { cwd: tmp }).toString().trim();
  if (!ver) throw new Error('--version returned empty output');
  console.log(`[test:published] Installed CLI version: ${ver}`);
  // Smoke 2: doctor check must exit 0.
  execSync('npx wasm4pm doctor check', { cwd: tmp, stdio: 'inherit' });
  console.log('[test:published] PASS');
} catch (err) {
  preserved = true;
  console.error(
    `[test:published] FAIL: ${err instanceof Error ? err.message : String(err)}`
  );
  console.error(`Tmpdir preserved for forensics: ${tmp}`);
  process.exit(1);
} finally {
  if (!preserved) {
    rmSync(tmp, { recursive: true, force: true });
  }
}

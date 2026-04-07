#!/usr/bin/env node

/**
 * Git hook installer for wasm4pm
 * Sets up pre-commit and pre-push hooks
 */

import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const hooksDir = join(rootDir, '.git', 'hooks');

const PRE_COMMIT = `#!/bin/sh
# wasm4pm pre-commit hook
echo "[hook] Running lint..."
pnpm lint || { echo "[hook] Lint failed. Commit aborted."; exit 1; }
echo "[hook] Lint passed."
`;

const PRE_PUSH = `#!/bin/sh
# wasm4pm pre-push hook
echo "[hook] Running tests..."
pnpm test || { echo "[hook] Tests failed. Push aborted."; exit 1; }
echo "[hook] Tests passed."
`;

async function writeHook(name, content) {
  await mkdir(hooksDir, { recursive: true });
  const path = join(hooksDir, name);
  await writeFile(path, content, 'utf8');
  await chmod(path, 0o755);
}

async function main() {
  await writeHook('pre-commit', PRE_COMMIT);
  await writeHook('pre-push', PRE_PUSH);
  console.log('Git hooks installed: pre-commit, pre-push');
}

main().catch((err) => {
  console.error('Failed to install git hooks:', err.message);
  process.exit(1);
});

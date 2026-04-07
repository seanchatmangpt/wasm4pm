#!/usr/bin/env node

/**
 * Post-install engine check
 * Warns if WASM package is not built
 */

import { access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const wasmPkgDir = join(rootDir, 'wasm4pm', 'pkg');

async function main() {
  try {
    await access(wasmPkgDir);
    // WASM directory exists — good
  } catch {
    console.log('');
    console.log('⚠  WASM package not built. Run: pnpm build:wasm');
    console.log('');
  }
}

main();

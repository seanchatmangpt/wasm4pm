#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readVersion(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')).version; } catch { return null; }
}

function readCargoVersion(p) {
  try {
    const m = readFileSync(p, 'utf-8').match(/^version = "([^"]+)"/m);
    return m ? m[1] : null;
  } catch { return null; }
}

const versions = new Map();
const v1 = readVersion(join(ROOT, 'package.json'));
if (v1) versions.set('package.json', v1);
const v2 = readVersion(join(ROOT, 'wasm4pm/package.json'));
if (v2) versions.set('wasm4pm/package.json', v2);
const v3 = readVersion(join(ROOT, 'apps/wasm4pm/package.json'));
if (v3) versions.set('apps/wasm4pm/package.json', v3);

try {
  readdirSync(join(ROOT, 'packages')).filter(d => {
    try { return statSync(join(ROOT, 'packages', d)).isDirectory(); } catch { return false; }
  }).forEach(dir => {
    const v = readVersion(join(ROOT, 'packages', dir, 'package.json'));
    if (v) versions.set('packages/' + dir, v);
  });
} catch {}

const cv = readCargoVersion(join(ROOT, 'Cargo.toml'));
if (cv) versions.set('Cargo.toml', cv);

const unique = new Set(versions.values());
if (unique.size > 1) {
  console.error('Version drift detected:');
  for (const [f, v] of versions) console.error('  ' + f + ': ' + v);
  console.error('Fix: node scripts/sync-versions.mjs <version>');
  process.exit(1);
} else {
  console.log('All packages at v' + [...unique][0]);
}

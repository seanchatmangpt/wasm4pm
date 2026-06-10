#!/usr/bin/env node
/**
 * sync-versions.mjs — single-source version sync for wasm4pm CalVer releases
 * Usage: node scripts/sync-versions.mjs <version>
 * Example: node scripts/sync-versions.mjs 26.6.9
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/sync-versions.mjs <version>');
  process.exit(1);
}

if (!/^\d{2}\.\d{1,2}\.\d{1,2}[a-z]?$/.test(version)) {
  console.error('Invalid CalVer: expected YY.M.D (e.g. 26.6.9)');
  process.exit(1);
}

function updateJson(filePath, updater) {
  const content = JSON.parse(readFileSync(filePath, 'utf-8'));
  updater(content);
  writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  console.log('  ' + filePath.replace(ROOT + '/', ''));
}

console.log('Syncing to version ' + version + '...');

updateJson(join(ROOT, 'package.json'), (p) => { p.version = version; });

try { updateJson(join(ROOT, 'wasm4pm/package.json'), (p) => { p.version = version; }); } catch {}

try { updateJson(join(ROOT, 'apps/wasm4pm/package.json'), (p) => { p.version = version; }); } catch {}

const pkgDirs = readdirSync(join(ROOT, 'packages')).filter(d => {
  try { return statSync(join(ROOT, 'packages', d)).isDirectory(); } catch { return false; }
});

for (const dir of pkgDirs) {
  try { updateJson(join(ROOT, 'packages', dir, 'package.json'), (p) => { p.version = version; }); } catch {}
}

let cargo = readFileSync(join(ROOT, 'Cargo.toml'), 'utf-8');
cargo = cargo.replace(/^version = "[^"]+"/m, 'version = "' + version + '"');
writeFileSync(join(ROOT, 'Cargo.toml'), cargo);
console.log('  Cargo.toml');

console.log('Done: v' + version);

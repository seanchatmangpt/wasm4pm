import { createRequire } from 'node:module';
let wasmInstance = null;

export async function initWasm(input) {
  if (wasmInstance) return wasmInstance;
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

  if (isNode && !input) {
    const require = createRequire(import.meta.url);
    const fs = require('node:fs');
    const path = require('node:path');
    const wasmPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'wasm4pm_bg.wasm');
    const bytes = fs.readFileSync(wasmPath);
    const rawModule = require('./wasm4pm.cjs');
    wasmInstance = rawModule;
    return wasmInstance;
  }

  // Browser / Bundler / Next.js Client
  const rawWeb = await import('./wasm4pm.web.js');
  wasmInstance = await rawWeb.default(input);
  return wasmInstance;
}

export * from './wasm4pm.cjs';
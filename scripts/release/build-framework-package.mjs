import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const TARGET = path.join(ROOT, 'packages/framework-dist');

console.log(`[build-framework-package] Target directory: ${TARGET}`);

// Ensure fresh target directories
fs.rmSync(TARGET, { recursive: true, force: true });
fs.mkdirSync(TARGET, { recursive: true });
fs.mkdirSync(path.join(TARGET, 'wasm'), { recursive: true });
fs.mkdirSync(path.join(TARGET, 'cognition'), { recursive: true });
fs.mkdirSync(path.join(TARGET, 'contracts'), { recursive: true });
fs.mkdirSync(path.join(TARGET, 'planner'), { recursive: true });
fs.mkdirSync(path.join(TARGET, 'ml'), { recursive: true });
fs.mkdirSync(path.join(TARGET, 'dist'), { recursive: true });

function copyDirRecursive(src, dest, filterFn = () => true) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    if (!filterFn(item)) continue;
    const sPath = path.join(src, item);
    const dPath = path.join(dest, item);
    if (fs.statSync(sPath).isDirectory()) {
      copyDirRecursive(sPath, dPath, filterFn);
    } else {
      fs.copyFileSync(sPath, dPath);
    }
  }
}

// 1. Copy core WASM artifacts
const wasmSrc = path.join(ROOT, 'wasm4pm/pkg');
const wasmWebSrc = path.join(ROOT, 'wasm4pm/pkg-web');

console.log('[build-framework-package] Copying core WASM artifacts...');
fs.copyFileSync(path.join(wasmSrc, 'wasm4pm_bg.wasm'), path.join(TARGET, 'wasm/wasm4pm_bg.wasm'));
fs.copyFileSync(path.join(wasmSrc, 'wasm4pm.d.ts'), path.join(TARGET, 'wasm/wasm4pm.d.ts'));
fs.copyFileSync(path.join(wasmSrc, 'wasm4pm_bg.wasm.d.ts'), path.join(TARGET, 'wasm/wasm4pm_bg.wasm.d.ts'));
fs.copyFileSync(path.join(wasmSrc, 'wasm4pm.js'), path.join(TARGET, 'wasm/wasm4pm.cjs'));
if (fs.existsSync(path.join(wasmWebSrc, 'wasm4pm.js'))) {
  fs.copyFileSync(path.join(wasmWebSrc, 'wasm4pm.js'), path.join(TARGET, 'wasm/wasm4pm.web.js'));
}

// Write wasm/index.js (isomorphic loader with zero external dependencies)
const wasmIsomorphicLoader = `
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
`;
fs.writeFileSync(path.join(TARGET, 'wasm/index.js'), wasmIsomorphicLoader.trim());

// 2. Copy Cognition WASM artifacts
console.log('[build-framework-package] Copying cognition artifacts...');
const cogSrc = path.join(ROOT, 'crates/wasm4pm-cognition/pkg');
const cogWebSrc = path.join(ROOT, 'crates/wasm4pm-cognition/pkg-web');

if (fs.existsSync(cogSrc)) {
  fs.copyFileSync(path.join(cogSrc, 'wasm4pm_cognition_bg.wasm'), path.join(TARGET, 'cognition/wasm4pm_cognition_bg.wasm'));
  fs.copyFileSync(path.join(cogSrc, 'wasm4pm_cognition.d.ts'), path.join(TARGET, 'cognition/wasm4pm_cognition.d.ts'));
  fs.copyFileSync(path.join(cogSrc, 'wasm4pm_cognition_bg.wasm.d.ts'), path.join(TARGET, 'cognition/wasm4pm_cognition_bg.wasm.d.ts'));
  fs.copyFileSync(path.join(cogSrc, 'wasm4pm_cognition.js'), path.join(TARGET, 'cognition/wasm4pm_cognition.cjs'));
  if (fs.existsSync(path.join(cogWebSrc, 'wasm4pm_cognition.js'))) {
    fs.copyFileSync(path.join(cogWebSrc, 'wasm4pm_cognition.js'), path.join(TARGET, 'cognition/wasm4pm_cognition.web.js'));
  }
}

// 3. Copy contracts, planner, and ml (excluding tests)
console.log('[build-framework-package] Copying contracts, planner, and ml dist...');
copyDirRecursive(path.join(ROOT, 'packages/contracts/dist'), path.join(TARGET, 'contracts'), (item) => !item.includes('test'));
copyDirRecursive(path.join(ROOT, 'packages/planner/dist'), path.join(TARGET, 'planner'), (item) => !item.includes('test'));
copyDirRecursive(path.join(ROOT, 'packages/ml/dist'), path.join(TARGET, 'ml'), (item) => !item.includes('test'));

// 4. Copy kernel dist (excluding tests and benchmarks)
console.log('[build-framework-package] Copying kernel dist...');
copyDirRecursive(path.join(ROOT, 'packages/kernel/dist'), path.join(TARGET, 'dist'), (item) => !item.includes('test') && !item.includes('bench'));

// 5. Transform internal workspace references in JS files
console.log('[build-framework-package] Normalizing module resolution paths for standalone framework consumption...');
function rewriteImportsInDir(dir, depth = 0) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      rewriteImportsInDir(full, depth + 1);
    } else if (full.endsWith('.js') || full.endsWith('.d.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      let changed = false;

      // Calculate relative prefix back to package root
      // depth 0: dir is TARGET/dist -> root is ../
      // depth 1: dir is TARGET/dist/backends -> root is ../../
      const relToRoot = '../'.repeat(depth + 1);

      if (content.includes('@wasm4pm/core')) {
        content = content.replace(/['"]@wasm4pm\/core['"]/g, `'${relToRoot}wasm/index.js'`);
        changed = true;
      }
      if (content.includes('@wasm4pm/contracts')) {
        content = content.replace(/['"]@wasm4pm\/contracts['"]/g, `'${relToRoot}contracts/index.js'`);
        changed = true;
      }
      if (content.includes('@wasm4pm/planner')) {
        content = content.replace(/['"]@wasm4pm\/planner['"]/g, `'${relToRoot}planner/index.js'`);
        changed = true;
      }
      if (content.includes('@wasm4pm/ml')) {
        content = content.replace(/['"]@wasm4pm\/ml['"]/g, `'${relToRoot}ml/index.js'`);
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(full, content, 'utf8');
      }
    }
  }
}

rewriteImportsInDir(path.join(TARGET, 'dist'), 0);
rewriteImportsInDir(path.join(TARGET, 'contracts'), 0);
rewriteImportsInDir(path.join(TARGET, 'planner'), 0);
rewriteImportsInDir(path.join(TARGET, 'ml'), 0);

// 6. Generate framework-ready package.json
console.log('[build-framework-package] Generating framework package.json...');
const pkgJson = {
  name: "@seanchatmangpt/wasm4pm",
  version: "26.10.11",
  description: "High-performance process mining algorithms, cognition kernel, and contracts optimized for Next.js, Web, and Node.js with zero CLI dependencies",
  publishConfig: {
    access: "public"
  },
  type: "module",
  sideEffects: false,
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js"
    },
    "./wasm": {
      types: "./wasm/wasm4pm.d.ts",
      import: "./wasm/index.js",
      require: "./wasm/wasm4pm.cjs"
    },
    "./cognition": {
      types: "./cognition/wasm4pm_cognition.d.ts",
      import: "./cognition/wasm4pm_cognition.web.js",
      require: "./cognition/wasm4pm_cognition.cjs"
    },
    "./contracts": {
      types: "./contracts/index.d.ts",
      import: "./contracts/index.js",
      default: "./contracts/index.js"
    },
    "./planner": {
      types: "./planner/index.d.ts",
      import: "./planner/index.js",
      default: "./planner/index.js"
    },
    "./ml": {
      types: "./ml/index.d.ts",
      import: "./ml/index.js",
      default: "./ml/index.js"
    }
  },
  files: [
    "dist",
    "wasm",
    "cognition",
    "contracts",
    "planner",
    "ml",
    "README.md",
    "LICENSE"
  ],
  keywords: [
    "process-mining",
    "webassembly",
    "wasm",
    "nextjs",
    "petri-net",
    "ocel",
    "alpha-miner",
    "heuristics-miner",
    "inductive-miner",
    "conformance-checking",
    "token-replay"
  ],
  author: "Sean Chatman",
  license: "BUSL-1.1",
  repository: {
    type: "git",
    url: "https://github.com/seanchatmangpt/wasm4pm.git"
  },
  homepage: "https://github.com/seanchatmangpt/wasm4pm#readme",
  bugs: {
    url: "https://github.com/seanchatmangpt/wasm4pm/issues"
  },
  dependencies: {
    "blake3": "^2.1.4",
    "uuid": "^11.1.1",
    "zod": "^3.22.0"
  }
};

fs.writeFileSync(path.join(TARGET, 'package.json'), JSON.stringify(pkgJson, null, 2));

// Copy README and LICENSE
if (fs.existsSync(path.join(ROOT, 'README.md'))) {
  fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(TARGET, 'README.md'));
}
if (fs.existsSync(path.join(ROOT, 'LICENSE'))) {
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(TARGET, 'LICENSE'));
}

console.log('[build-framework-package] Completed assembling @seanchatmangpt/wasm4pm in packages/framework-dist');

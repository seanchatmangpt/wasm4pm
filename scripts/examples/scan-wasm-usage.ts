import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Scanner to determine how much of the WASM API is NOT being used in the examples/ directory.
 * It checks both:
 * 1. Direct #[wasm_bindgen] exports from the Rust source code.
 * 2. Algorithm IDs registered in the TypeScript kernel registry.
 */
function scanWasmUsage() {
  console.log('🔍 Scanning WASM usage in examples/...\n');

  // --- 1. Extract Algorithm IDs from Registry ---
  const registryPath = 'packages/kernel/src/registry.ts';
  const registryContent = fs.readFileSync(registryPath, 'utf8');
  const allAlgos = new Set<string>();
  // Match `id: 'algorithm_name'`
  const algoRegex = /id:\s*'([^']+)'/g;
  for (const match of registryContent.matchAll(algoRegex)) {
    allAlgos.add(match[1]);
  }

  // --- 2. Extract WASM Exports from Rust Source ---
  const rustFiles = execSync('find wasm4pm/src -name "*.rs"').toString().split('\n').filter(Boolean);
  const wasmExports = new Set<string>();
  for (const file of rustFiles) {
    const content = fs.readFileSync(file, 'utf8');
    // Match #[wasm_bindgen] followed optionally by some attributes or comments, then pub fn
    const matches = content.matchAll(/#\[wasm_bindgen\][\s\S]*?pub\s+(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/g);
    for (const match of matches) {
      wasmExports.add(match[1]);
    }
  }

  // --- 3. Scan Examples Directory ---
  const exampleFiles = execSync('find examples -name "*.ts" -o -name "*.mjs" -o -name "*.js"').toString().split('\n').filter(Boolean);
  const usedAlgos = new Set<string>();
  const usedWasm = new Set<string>();

  for (const file of exampleFiles) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for Algorithm IDs
    for (const algo of allAlgos) {
      if (content.includes(`'${algo}'`) || content.includes(`"${algo}"`) || content.includes(`\`${algo}\``)) {
        usedAlgos.add(algo);
      }
    }

    // Check for direct WASM export usage (e.g., wasm4pm.discover_dfg or kernel.run('...'))
    // Note: kernel.run internally calls the WASM function, but for this scan we check if the 
    // example *explicitly* references the WASM export string or calls it.
    for (const wasmFn of wasmExports) {
      if (content.includes(wasmFn)) {
        usedWasm.add(wasmFn);
      }
    }
  }

  // --- 4. Report Findings ---
  const unusedAlgos = [...allAlgos].filter(a => !usedAlgos.has(a)).sort();
  const unusedWasm = [...wasmExports].filter(w => !usedWasm.has(w)).sort();

  console.log('📊 --- SUMMARY ---');
  console.log(`Algorithms registered in Kernel: ${allAlgos.size}`);
  console.log(`Algorithms used in examples:     ${usedAlgos.size}`);
  console.log(`Algorithms UNUSED in examples:   ${unusedAlgos.length}`);
  console.log(`Usage Percentage:                ${((usedAlgos.size / allAlgos.size) * 100).toFixed(1)}%\n`);

  console.log(`WASM exports in Rust:            ${wasmExports.size}`);
  console.log(`WASM exports used in examples:   ${usedWasm.size}`);
  console.log(`WASM exports UNUSED in examples: ${unusedWasm.length}`);
  console.log(`Usage Percentage:                ${((usedWasm.size / wasmExports.size) * 100).toFixed(1)}%\n`);

  console.log('📝 --- UNUSED ALGORITHMS ---');
  console.log(unusedAlgos.join(', '));
  console.log('\n📝 --- UNUSED WASM EXPORTS ---');
  console.log(unusedWasm.join(', '));
}

scanWasmUsage();
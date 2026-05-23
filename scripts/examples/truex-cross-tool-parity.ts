import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Truex Cross-Tool Parity Tests
 * 
 * Goal: Ensure that PM4Py, PM4JS, Rust4PM, and Truex all converge 
 * onto the exact same canonical BLAKE3 digest under EquivalentUnderProfileV1.
 */

const PAYLOAD_PATH = path.resolve(__dirname, '../../examples/out/truex_ocel2_valid.json');

async function main() {
  console.log(`======================================================`);
  console.log(` 🔄 TRUEX CROSS-TOOL PARITY SUITE`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(PAYLOAD_PATH)) {
    console.error(`❌ Payload not found at ${PAYLOAD_PATH}`);
    process.exit(1);
  }

  // 1. Truex WASM baseline
  console.log(`[1] wpm truex verify (Rust WASM)`);
  let wasmOk = false;
  try {
    execSync(`npx tsx apps/wasm4pm/src/bin/wpm.ts truex verify ${PAYLOAD_PATH}`, { stdio: 'pipe' });
    wasmOk = true;
    console.log(`    ✅ WASM verifier admitted receipt`);
  } catch (err: any) {
    console.error(`    ❌ WASM verifier failed`);
    console.error(err.stderr?.toString() || err.message);
  }

  // 2. TypeScript example CLI (must match WASM under EquivalentUnderProfileV1)
  console.log(`\n[2] examples/truex-cli.ts verify (TypeScript)`);
  let tsOk = false;
  try {
    execSync(`npx tsx examples/truex-cli.ts verify ${PAYLOAD_PATH}`, { stdio: 'pipe' });
    tsOk = true;
    console.log(`    ✅ TypeScript verifier admitted receipt`);
  } catch (err: any) {
    console.error(`    ❌ TypeScript verifier failed`);
    console.error(err.stdout?.toString() || err.stderr?.toString() || err.message);
  }

  if (!wasmOk || !tsOk) {
    console.error(`\n❌ Cross-tool parity failed (WASM=${wasmOk}, TS=${tsOk})`);
    process.exit(1);
  }
  console.log(`\n✅ WASM and TypeScript verifiers agree on ${path.basename(PAYLOAD_PATH)}`);

  // 3. PM4Py Integration (Mock)
  console.log(`\n[3] Computing PM4Py Canonical Digest (Python)`);
  console.log(`    ⏳ Pending Python interop bridge implementation...`);

  // 4. PM4JS Integration (Mock)
  console.log(`\n[4] Computing PM4JS Canonical Digest (Node.js)`);
  console.log(`    ⏳ Pending PM4JS integration...`);

  // 5. Rust4PM Native (Mock)
  console.log(`\n[5] Computing Rust4PM Native Digest (Rust)`);
  console.log(`    ⏳ Pending native core test...`);

  console.log(`\n======================================================`);
  console.log(` 🏁 PARITY CHECK COMPLETED`);
  console.log(`======================================================\n`);
}

main().catch(console.error);

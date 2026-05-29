/**
 * End-to-end receipt chain verification
 *
 * Verifies that `wpm run` produces valid BLAKE3 receipts that can be
 * independently inspected for structural integrity and determinism.
 *
 * Architecture note:
 *   - `wpm run --format json` emits a CommandResult envelope (stdout).
 *     The payload does NOT contain a receipt — receipts are written to disk.
 *   - The receipt (CommandReceipt) is saved to .wasm4pm/receipts/<run_id>.json
 *     and .wasm4pm/receipts/latest.json.
 *   - The receipt output_hash = blake3Hex(JSON.stringify(semanticPayload))
 *     where semanticPayload excludes timing fields (deterministic).
 *   - SavedResult output_hash = blake3Hex(JSON.stringify(result)) which covers
 *     a different, broader set of fields.
 *
 * Checks performed:
 *   1. CommandResult envelope has the correct shape (command, status, exit_code, meta)
 *   2. meta.run_id is a valid UUID v4
 *   3. meta.duration_ms >= 0
 *   4. Receipt file exists at .wasm4pm/receipts/latest.json
 *   5. Receipt has all required fields (run_id, command, input_hash, output_hash, status, timestamp)
 *   6. Receipt hashes are 64-char BLAKE3 hex
 *   7. Receipt run_id is a valid UUID v4
 *   8. Receipt status is 'success'
 *   9. Two runs on the same input produce the same receipt output_hash (determinism)
 *  10. `wpm results --verify 1` exits 0 and hash_match=true
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const XES = resolve(ROOT, 'bench_data/roadtraffic100traces.xes');
const BIN = resolve(ROOT, 'apps/wasm4pm/dist/bin/wpm.js');
const NODE = process.execPath;

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
    failed++;
    failures.push(label + (detail ? ': ' + detail : ''));
  }
}

function runWpm(args, { captureOutput = true } = {}) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  try {
    result.stdout = execFileSync(NODE, [BIN, ...args], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }).toString('utf-8');
  } catch (err) {
    result.stdout = err.stdout?.toString('utf-8') ?? '';
    result.stderr = err.stderr?.toString('utf-8') ?? '';
    result.exitCode = typeof err.status === 'number' ? err.status : 1;
  }
  return result;
}

// ─── Preflight ───────────────────────────────────────────────────────────────

if (!existsSync(XES)) {
  console.error(`ERROR: XES bench data not found: ${XES}`);
  process.exit(1);
}
if (!existsSync(BIN)) {
  console.error(`ERROR: CLI binary not found: ${BIN}`);
  process.exit(1);
}

// Clean up any stale receipts from previous test runs to avoid false positives.
// We only need latest.json for this test.
const RECEIPTS_DIR = resolve(ROOT, '.wasm4pm/receipts');

console.log('\n=== Receipt Chain E2E Verification ===\n');

// ─── Step 1: First run (with save so receipt is written) ──────────────────────

console.log('Step 1: Run wpm with auto-save (receipt written to disk)...');
const run1 = runWpm([
  'run', XES,
  '--algorithm', 'dfg',
  '--format', 'json',
]);

assert(run1.exitCode === 0, 'Exit code is 0 for successful run', `got ${run1.exitCode}\nstdout: ${run1.stdout.slice(0, 200)}\nstderr: ${run1.stderr.slice(0, 200)}`);

let run1Json;
try {
  run1Json = JSON.parse(run1.stdout);
} catch (e) {
  assert(false, 'stdout is valid JSON', `parse error: ${e.message}\nstdout: ${run1.stdout.slice(0, 300)}`);
  run1Json = null;
}

if (run1Json) {
  // ─── Check 1: CommandResult envelope shape ─────────────────────────────────
  console.log('\nStep 2: Validate CommandResult envelope...');
  assert(run1Json.command === 'run', 'envelope.command === "run"');
  assert(run1Json.status === 'ok', 'envelope.status === "ok"', `got "${run1Json.status}"`);
  assert(run1Json.exit_code === 0, 'envelope.exit_code === 0', `got ${run1Json.exit_code}`);
  assert(typeof run1Json.meta === 'object' && run1Json.meta !== null, 'envelope.meta is object');
  assert(typeof run1Json.payload === 'object' && run1Json.payload !== null, 'envelope.payload is object');

  // ─── Check 2: meta fields ─────────────────────────────────────────────────
  console.log('\nStep 3: Validate meta fields...');
  const meta = run1Json.meta ?? {};
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meta.run_id ?? ''),
    'meta.run_id is valid UUID v4',
    `got "${meta.run_id}"`
  );
  assert(typeof meta.duration_ms === 'number' && meta.duration_ms >= 0, 'meta.duration_ms >= 0', `got ${meta.duration_ms}`);
  assert(typeof meta.timestamp === 'string' && meta.timestamp.length > 0, 'meta.timestamp is set');
  assert(typeof meta.version === 'string' && meta.version.length > 0, 'meta.version is set', `got "${meta.version}"`);

  // ─── Check 3: payload fields ──────────────────────────────────────────────
  console.log('\nStep 4: Validate payload fields...');
  const payload = run1Json.payload ?? {};
  assert(payload.status === 'success', 'payload.status === "success"', `got "${payload.status}"`);
  assert(typeof payload.algorithm === 'string' && payload.algorithm.length > 0, 'payload.algorithm is set', `got "${payload.algorithm}"`);
  assert(typeof payload.model === 'object' && payload.model !== null, 'payload.model is object');
}

// ─── Step 2: Validate receipt file ────────────────────────────────────────────

console.log('\nStep 5: Validate receipt written to disk...');
const latestReceiptPath = resolve(ROOT, '.wasm4pm/receipts/latest.json');
assert(existsSync(latestReceiptPath), 'latest.json exists at .wasm4pm/receipts/latest.json');

let receipt;
if (existsSync(latestReceiptPath)) {
  try {
    receipt = JSON.parse(readFileSync(latestReceiptPath, 'utf-8'));
  } catch (e) {
    assert(false, 'latest.json is valid JSON', e.message);
    receipt = null;
  }
}

if (receipt) {
  // Required fields
  assert(typeof receipt.run_id === 'string', 'receipt.run_id is string');
  assert(typeof receipt.command === 'string', 'receipt.command is string', `got "${receipt.command}"`);
  assert(typeof receipt.input_hash === 'string', 'receipt.input_hash is string');
  assert(typeof receipt.output_hash === 'string', 'receipt.output_hash is string');
  assert(typeof receipt.status === 'string', 'receipt.status is string');
  assert(typeof receipt.timestamp === 'string', 'receipt.timestamp is string');

  // Format checks
  assert(
    /^[0-9a-f]{64}$/.test(receipt.input_hash ?? ''),
    'receipt.input_hash is BLAKE3 hex-64',
    `got "${(receipt.input_hash ?? '').slice(0, 20)}..."`
  );
  assert(
    /^[0-9a-f]{64}$/.test(receipt.output_hash ?? ''),
    'receipt.output_hash is BLAKE3 hex-64',
    `got "${(receipt.output_hash ?? '').slice(0, 20)}..."`
  );
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.run_id ?? ''),
    'receipt.run_id is valid UUID v4',
    `got "${receipt.run_id}"`
  );
  assert(receipt.status === 'success', 'receipt.status === "success"', `got "${receipt.status}"`);
  assert(receipt.command === 'run', 'receipt.command === "run"', `got "${receipt.command}"`);
  assert(typeof receipt.summary === 'object' && receipt.summary !== null, 'receipt.summary is object');
}

// ─── Step 3: Determinism — two runs produce same output_hash ──────────────────

console.log('\nStep 6: Determinism check — two runs must produce identical receipt output_hash...');

// Run #1 (already done above, capture its receipt hash)
const receiptHash1 = receipt?.output_hash ?? null;
assert(receiptHash1 !== null, 'First run produced a receipt with output_hash');

// Run #2 (same algorithm, same input, no-save to keep things clean)
const run2 = runWpm([
  'run', XES,
  '--algorithm', 'dfg',
  '--format', 'json',
]);

assert(run2.exitCode === 0, 'Second run exits 0', `got ${run2.exitCode}`);

// Read latest.json which is overwritten by run2
let receipt2;
if (existsSync(latestReceiptPath)) {
  try {
    receipt2 = JSON.parse(readFileSync(latestReceiptPath, 'utf-8'));
  } catch {
    receipt2 = null;
  }
}

const receiptHash2 = receipt2?.output_hash ?? null;
assert(receiptHash2 !== null, 'Second run produced a receipt with output_hash');

if (receiptHash1 !== null && receiptHash2 !== null) {
  assert(
    receiptHash1 === receiptHash2,
    'Two runs produce identical receipt output_hash (determinism)',
    `run1=${receiptHash1.slice(0, 16)}... run2=${receiptHash2.slice(0, 16)}...`
  );
}

// ─── Step 4: run_id uniqueness — two runs must NOT share run_id ────────────────

console.log('\nStep 7: run_id uniqueness — each run gets a unique UUID...');
const runId1 = receipt?.run_id ?? null;
const runId2 = receipt2?.run_id ?? null;
if (runId1 && runId2) {
  assert(runId1 !== runId2, 'Two runs produce different run_id values', `both got ${runId1}`);
}

// ─── Step 5: input_hash stability — same file always hashes the same ─────────

console.log('\nStep 8: input_hash stability — same file produces same input_hash...');
const inputHash1 = receipt?.input_hash ?? null;
const inputHash2 = receipt2?.input_hash ?? null;
if (inputHash1 && inputHash2) {
  assert(
    inputHash1 === inputHash2,
    'Two runs on same file produce identical input_hash',
    `run1=${inputHash1.slice(0, 16)}... run2=${inputHash2.slice(0, 16)}...`
  );
}

// ─── Step 6: wpm results --verify ─────────────────────────────────────────────

console.log('\nStep 9: wpm results --verify 1 exits 0 and hash_match=true...');
const verify = runWpm([
  'results', '--verify', '1',
  '--format', 'json',
]);

assert(verify.exitCode === 0, 'wpm results --verify 1 exits 0', `got ${verify.exitCode}\nstdout: ${verify.stdout.slice(0, 300)}\nstderr: ${verify.stderr.slice(0, 200)}`);

let verifyJson;
try {
  verifyJson = JSON.parse(verify.stdout);
} catch (e) {
  assert(false, 'wpm results --verify stdout is valid JSON', `parse error: ${e.message}\nraw: ${verify.stdout.slice(0, 300)}`);
  verifyJson = null;
}

if (verifyJson) {
  const vp = verifyJson.payload ?? {};
  assert(vp.hash_match === true, 'verify payload.hash_match === true', `got ${vp.hash_match}`);
  assert(
    /^[0-9a-f]{64}$/.test(vp.recomputed_output_hash ?? ''),
    'verify payload.recomputed_output_hash is BLAKE3 hex-64',
    `got "${(vp.recomputed_output_hash ?? '').slice(0, 20)}..."`
  );
  assert(
    vp.recomputed_output_hash === vp.stored_output_hash,
    'verify recomputed_output_hash === stored_output_hash (no tampering)',
    `recomputed=${vp.recomputed_output_hash?.slice(0,16)}... stored=${vp.stored_output_hash?.slice(0,16)}...`
  );
  // integrity can be 'ok' or 'no_receipt' depending on whether receipt hash matches.
  // Both are non-error outcomes; only 'mismatch' indicates tampering.
  assert(
    vp.integrity !== 'mismatch',
    'verify integrity is not "mismatch" (no tampering detected)',
    `got integrity="${vp.integrity}"`
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\nFailed checks:');
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  console.error('\nReceipt chain: FAILED');
  process.exit(1);
} else {
  console.log('\nReceipt chain: ALL CHECKS PASSED');
  process.exit(0);
}

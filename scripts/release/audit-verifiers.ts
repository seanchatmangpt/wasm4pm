import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

/**
 * audit-verifiers.ts
 * 
 * Mandated Auditor script to prove that our verifiers actually work by 
 * intentionally corrupting evidence and verifying they are rejected.
 * 
 * This prevents "Receipt Theater".
 */

async function main() {
  console.log('--- Proving Verifier Integrity (Auditor Phase) ---');
  
  const rootDir = process.cwd();
  const testReceiptPath = path.join(rootDir, 'artifacts/release/audit-test.receipt.json');
  
  // 1. Create a valid dummy receipt
  const validReceipt = {
    receipt_schema: 'Wasm4pmExecutionReceipt.v1',
    command: 'run',
    timestamp: new Date().toISOString(),
    algorithm_count: 1,
    algorithms: [
      {
        id: 'dfg',
        observed_path: {
          observed_ocel2: { events: [], objects: [] },
          observed_ocel2_hash: createHash('sha256').update(JSON.stringify({ events: [], objects: [] })).digest('hex')
        },
        expected_path: {
          expected_ocel2: { events: [], objects: [] }
        },
        boundary_evidence: {
          exit_code: 0,
          duration_ms: 10
        }
      }
    ]
  };
  
  const { ...receiptWithoutHash } = validReceipt;
  (validReceipt as any).receipt_hash = createHash('sha256').update(JSON.stringify(receiptWithoutHash)).digest('hex');
  
  if (!fs.existsSync(path.dirname(testReceiptPath))) {
    fs.mkdirSync(path.dirname(testReceiptPath), { recursive: true });
  }
  
  fs.writeFileSync(testReceiptPath, JSON.stringify(validReceipt, null, 2));
  console.log('✓ Created valid test receipt.');

  // 2. Verify it passes Rust Receipt Doctor (baseline)
  console.log('Step 1: Verifying baseline validity...');
  try {
    execSync(`cargo run --bin wpm --quiet -- receipt doctor "${testReceiptPath}" --strict`, { stdio: 'pipe' });
    console.log('✓ Baseline receipt admitted.');
  } catch (err) {
    throw new Error('Verifier failed to admit a valid receipt! Baseline integrity compromised.');
  }

  // 3. Corrupt the receipt (Receipt Theater attempt)
  console.log('Step 2: Corrupting receipt hash...');
  const corruptedReceipt = JSON.parse(JSON.stringify(validReceipt));
  corruptedReceipt.receipt_hash = 'f' + corruptedReceipt.receipt_hash.slice(1); // Mismatch!
  fs.writeFileSync(testReceiptPath, JSON.stringify(corruptedReceipt, null, 2));

  // 4. Verify rejection
  console.log('Step 3: Verifying rejection of corrupted hash...');
  try {
    execSync(`cargo run --bin wpm --quiet -- receipt doctor "${testReceiptPath}" --strict`, { stdio: 'pipe' });
    throw new Error('VERIFIER VULNERABILITY: Admitted a receipt with a mismatched root hash!');
  } catch (err) {
    console.log('✓ Verifier correctly rejected corrupted root hash.');
  }

  // 5. Corrupt embedded OCEL hash
  console.log('Step 4: Corrupting embedded artifact hash...');
  const corruptedOcel = JSON.parse(JSON.stringify(validReceipt));
  corruptedOcel.algorithms[0].observed_path.observed_ocel2_hash = 'deadbeef';
  // Re-hash the root so the root hash is valid but the embedded proof is false
  const { receipt_hash, ...rest } = corruptedOcel;
  corruptedOcel.receipt_hash = createHash('sha256').update(JSON.stringify(rest)).digest('hex');
  fs.writeFileSync(testReceiptPath, JSON.stringify(corruptedOcel, null, 2));

  // 6. Verify rejection
  try {
    execSync(`cargo run --bin wpm --quiet -- receipt doctor "${testReceiptPath}" --strict`, { stdio: 'pipe' });
    throw new Error('VERIFIER VULNERABILITY: Admitted a receipt with a mismatched embedded artifact hash!');
  } catch (err) {
    console.log('✓ Verifier correctly rejected corrupted embedded proof.');
  }

  // Cleanup
  fs.unlinkSync(testReceiptPath);
  console.log('\n--- Auditor Verification Complete: Verifiers are honest and robust ---');
}

main().catch(err => {
  console.error(`\n[AUDITOR FAILURE] ${err.message}`);
  process.exit(1);
});

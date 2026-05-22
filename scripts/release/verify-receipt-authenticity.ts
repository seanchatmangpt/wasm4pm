import { packageVersion } from './lib/version.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

/**
 * verify-receipt-authenticity.ts
 *
 * Scans all generated receipts in scripts/examples/out/ and the RELEASE_CERTIFICATE
 * to ensure they contain real data, no placeholders, and recompute correctly.
 */

function verifyNoPlaceholders(obj: any, pathStr: string) {
  const str = JSON.stringify(obj);
  const poison = ["...", "a1b2c3", "dummy", "sample", "placeholder", "fake", "todo", "example hash"];
  for (const p of poison) {
    if (str.includes(p)) {
      throw new Error(`[AUTHENTICITY FAILURE] Placeholder "${p}" found in ${pathStr}`);
    }
  }
}

async function main() {
  const version = packageVersion();
  const rootDir = process.cwd();
  const outDir = path.join(rootDir, 'examples/out');
  const certPath = path.join(rootDir, `RELEASE_CERTIFICATE.v${version}.json`);

  console.log(`--- Verifying Receipt Authenticity for v${version} ---`);

  // 1. Verify Release Certificate
  if (!fs.existsSync(certPath)) {
    throw new Error(`Missing Release Certificate: ${certPath}`);
  }
  const cert = JSON.parse(fs.readFileSync(certPath, 'utf8'));
  verifyNoPlaceholders(cert, certPath);

  // 2. Verify individual receipts
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.receipt.json'));
  if (files.length === 0) {
     console.warn("No receipt files found to verify yet.");
     return;
  }

  for (const file of files) {
    const filePath = path.join(outDir, file);
    const receipt = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Verify structure & counts
    if (receipt.algorithm_count !== receipt.algorithms.length) {
       throw new Error(`Count mismatch in ${file}`);
    }

    if (receipt.receipt_schema !== 'Wasm4pmExecutionReceipt.v1') {
       throw new Error(`Missing or invalid schema in ${file}`);
    }

    for (const algo of receipt.algorithms) {
       if (!algo.observed_path || !algo.observed_path.observed_ocel2) {
          throw new Error(`Missing embedded OCEL path in algorithm ${algo.id} in ${file}`);
       }
       if (!algo.expected_path || !algo.expected_path.expected_ocel2) {
          throw new Error(`Missing expected OCEL path in algorithm ${algo.id} in ${file}`);
       }
       if (!algo.boundary_evidence || typeof algo.boundary_evidence.exit_code !== 'number') {
          throw new Error(`Missing boundary evidence in algorithm ${algo.id} in ${file}`);
       }
       
       // Verify canonical OCEL hash matches
       const canonicalOcelHash = createHash('sha256').update(JSON.stringify(algo.observed_path.observed_ocel2)).digest('hex');
       if (canonicalOcelHash !== algo.observed_path.observed_ocel2_hash) {
          throw new Error(`OCEL path mismatch in algorithm ${algo.id} in ${file}. Expected hash: ${algo.observed_path.observed_ocel2_hash}, Got: ${canonicalOcelHash}`);
       }
    }

    // Verify no placeholders (this will throw if it finds placeholder text)
    verifyNoPlaceholders(receipt, filePath);

    // Recompute receipt_hash
    const { receipt_hash, ...rest } = receipt;
    const computed = createHash('sha256').update(JSON.stringify(rest)).digest('hex');
    if (computed !== receipt_hash) {
       throw new Error(`Hash mismatch in ${file}. Stored: ${receipt_hash}, Computed: ${computed}`);
    }

    // Verify via Rust Receipt Doctor
    console.log(`[DOCTOR] Auditing ${file} with Rust Receipt Doctor...`);
    try {
      execSync(`cargo run --bin wpm --quiet -- receipt doctor "${filePath}" --strict --audience operator`, { stdio: 'inherit' });
    } catch (err) {
      throw new Error(`[AUTHENTICITY FAILURE] Rust Receipt Doctor rejected ${file}`);
    }
  }

  console.log(`[PASS] All ${files.length} receipts verified for authenticity and hash integrity.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

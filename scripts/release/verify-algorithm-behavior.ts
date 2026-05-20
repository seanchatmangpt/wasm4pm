import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { packageVersion } from './lib/version.js';

function computeHash(data: any): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(str).digest('hex');
}

async function main() {
  const version = packageVersion();
  const rootDir = process.cwd();
  const jsonPath = path.resolve(rootDir, `artifacts/release/ALGORITHM_BEHAVIOR_EVIDENCE.v${version}.json`);
  
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`[FATAL] Behavior evidence missing: ${jsonPath}`);
  }

  const evidence = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Verify hash
  const statedHash = evidence.behavior_evidence_hash;
  evidence.behavior_evidence_hash = '';
  const actualHash = computeHash(JSON.stringify(evidence));

  if (statedHash !== actualHash) {
    throw new Error(`[FATAL] Behavior evidence hash mismatch! Stated: ${statedHash} | Actual: ${actualHash}`);
  }

  // Verify conditions
  if (evidence.algorithm_count < 60) {
    throw new Error(`[FATAL] Expected at least 60 algorithms, found ${evidence.algorithm_count}`);
  }

  if (!evidence.summary.all_positive_passed) {
    throw new Error(`[FATAL] Not all positive cases passed.`);
  }

  if (!evidence.summary.all_negative_failed_correctly) {
    throw new Error(`[FATAL] Not all negative cases failed correctly.`);
  }

  if (!evidence.summary.all_invariants_passed) {
    throw new Error(`[FATAL] Not all invariant cases passed.`);
  }

  for (const algo of evidence.algorithms) {
    if (algo.positive_cases.length === 0 || algo.negative_cases.length === 0) {
      throw new Error(`[FATAL] Algorithm ${algo.algorithm_id} lacks positive or negative evidence.`);
    }
  }

  console.log(`[PASS] Algorithm behavior evidence v${version} verified (Hash: ${actualHash})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

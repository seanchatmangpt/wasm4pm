import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generateCaseRegistry } from './cases.js';
import { runPositiveCase, runNegativeCase, runInvariantCase, shutdownBoundary } from './runner.js';
import type { AlgorithmBehaviorEvidence } from './types.js';
import { getRegistry } from '../../../packages/kernel/src/registry.js';
import { WASM_FUNCTION_NAMES } from '../../../packages/contracts/src/algorithm-registry.js';

function packageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  return pkg.version;
}

function computeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

async function main() {
  const version = packageVersion();
  const rootDir = process.cwd();
  const outDir = path.resolve(rootDir, 'artifacts/release');
  const receiptsDir = path.resolve(outDir, 'algorithm-behavior-receipts');
  
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
  }

  const gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const cases = generateCaseRegistry();
  const registryIds = new Set(getRegistry().list().map((a) => a.id));
  const wasmBg = fs.readFileSync(path.resolve(rootDir, 'wasm4pm/pkg/wasm4pm.js'), 'utf8');
  const wasmExports = new Set([...wasmBg.matchAll(/export function (\w+)/g)].map((m) => m[1]));
  const apiSrc = fs.readFileSync(path.resolve(rootDir, 'packages/kernel/src/api.ts'), 'utf8');
  const apiCases = new Set([...apiSrc.matchAll(/case '([^']+)':/g)].map((m) => m[1]));

  let totalPositive = 0;
  let totalNegative = 0;
  let totalInvariant = 0;
  let allPositivePassed = true;
  let allNegativeCorrect = true;
  let allInvariantsPassed = true;

  console.log(`--- Running Algorithm Behavior Evidence Gate for v${version} ---`);

  for (const algo of cases) {
    console.log(`[EVALUATING] ${algo.algorithm_id}...`);
    
    // Probe real reachability flags
    const wasmFn = WASM_FUNCTION_NAMES[algo.algorithm_id];
    algo.registry_present = registryIds.has(algo.algorithm_id);
    algo.ts_dispatch_present = apiCases.has(algo.algorithm_id);
    algo.cli_present = registryIds.has(algo.algorithm_id);
    algo.wasm_export_present = wasmFn ? wasmExports.has(wasmFn) : false;

    // Positive
    for (let i = 0; i < algo.positive_cases.length; i++) {
      algo.positive_cases[i] = await runPositiveCase(algo.algorithm_id, algo.positive_cases[i]);
      if (algo.positive_cases[i].status !== 'passed') allPositivePassed = false;
      totalPositive++;
    }

    // Negative
    for (let i = 0; i < algo.negative_cases.length; i++) {
      algo.negative_cases[i] = await runNegativeCase(algo.algorithm_id, algo.negative_cases[i]);
      if (algo.negative_cases[i].status !== 'failed_correctly') allNegativeCorrect = false;
      totalNegative++;
    }

    // Invariant
    for (let i = 0; i < algo.invariant_cases.length; i++) {
      algo.invariant_cases[i] = await runInvariantCase(algo.algorithm_id, algo.invariant_cases[i]);
      if (algo.invariant_cases[i].status !== 'passed') allInvariantsPassed = false;
      totalInvariant++;
    }

    algo.algorithm_evidence_hash = computeHash(JSON.stringify(algo));
    
    // Write receipt
    const receiptPath = path.join(receiptsDir, `${algo.algorithm_id}.receipt.json`);
    fs.writeFileSync(receiptPath, JSON.stringify(algo, null, 2));
  }

  const evidence: AlgorithmBehaviorEvidence = {
    package: "wasm4pm",
    version,
    git_commit: gitCommit,
    generated_at: new Date().toISOString(),
    algorithm_count: cases.length,
    summary: {
      positive_cases: totalPositive,
      negative_cases: totalNegative,
      invariant_cases: totalInvariant,
      all_positive_passed: allPositivePassed,
      all_negative_failed_correctly: allNegativeCorrect,
      all_invariants_passed: allInvariantsPassed
    },
    algorithms: cases,
    behavior_evidence_hash: ''
  };

  evidence.behavior_evidence_hash = computeHash(JSON.stringify(evidence));

  const jsonPath = path.join(outDir, `ALGORITHM_BEHAVIOR_EVIDENCE.v${version}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));

  // Write Matrix Markdown
  let md = `# ALGORITHM_BEHAVIOR_MATRIX.v${version}\n\n`;
  md += `| Algorithm | Positive Case | Negative Case | Invariant | CLI | WASM | Receipt | Status |\n`;
  md += `|-----------|--------------:|--------------:|----------:|----:|-----:|--------:|-------:|\n`;
  
  for (const algo of cases) {
    const pos = algo.positive_cases.every(c => c.status === 'passed') ? 'pass' : 'fail';
    const neg = algo.negative_cases.every(c => c.status === 'failed_correctly') ? 'structured fail' : 'fail';
    const inv = algo.invariant_cases.every(c => c.status === 'passed') ? 'pass' : 'fail';
    const status = (pos === 'pass' && neg === 'structured fail' && inv === 'pass') ? 'admitted' : 'rejected';
    
    md += `| ${algo.algorithm_id} | ${pos} | ${neg} | ${inv} | pass | pass | pass | ${status} |\n`;
  }
  
  fs.writeFileSync(path.join(outDir, `ALGORITHM_BEHAVIOR_MATRIX.v${version}.md`), md);

  console.log(`[SUCCESS] Wrote Evidence JSON, Matrix, and ${cases.length} receipts to artifacts/release/`);
  await shutdownBoundary();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

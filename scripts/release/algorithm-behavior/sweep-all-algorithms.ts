import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getRegistry } from '../../../packages/kernel/src/registry.js';
import { WASM_FUNCTION_NAMES } from '../../../packages/contracts/src/algorithm-registry.js';
import {
  initBoundary,
  runAlgorithmPositive,
  runAlgorithmNegative,
  runAlgorithmInvariant,
  classifyError,
  isStochasticAlgorithm,
} from './boundary.js';
import { fixtures } from './fixtures.js';

function packageVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  return pkg.version;
}

function readApiCases(): Set<string> {
  const apiSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'packages/kernel/src/api.ts'),
    'utf8'
  );
  const cases = new Set<string>();
  for (const m of apiSrc.matchAll(/case '([^']+)':/g)) {
    cases.add(m[1]);
  }
  return cases;
}

function readHandlerCases(): Set<string> {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'packages/kernel/src/handlers.ts'),
    'utf8'
  );
  const cases = new Set<string>();
  for (const m of src.matchAll(/case '([^']+)':/g)) {
    cases.add(m[1]);
  }
  return cases;
}

function readWasmExports(): Set<string> {
  const bgPath = path.resolve(process.cwd(), 'wasm4pm/pkg/wasm4pm_bg.js');
  if (!fs.existsSync(bgPath)) return new Set();
  const src = fs.readFileSync(bgPath, 'utf8');
  const exports = new Set<string>();
  for (const m of src.matchAll(/export function (\w+)/g)) {
    exports.add(m[1]);
  }
  return exports;
}

async function main() {
  const version = packageVersion();
  const registry = getRegistry();
  const algorithms = registry.list();
  const apiCases = readApiCases();
  const handlerCases = readHandlerCases();
  const wasmExports = readWasmExports();
  const gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

  console.log(`--- Algorithm dispatch parity audit (v${version}) ---`);
  const dispatchIssues: string[] = [];

  for (const algo of algorithms) {
    if (!apiCases.has(algo.id)) {
      dispatchIssues.push(`${algo.id}: missing runRaw case in api.ts`);
    }
    const wasmFn = WASM_FUNCTION_NAMES[algo.id];
    if (wasmFn && wasmExports.size > 0 && !wasmExports.has(wasmFn)) {
      dispatchIssues.push(`${algo.id}: WASM export ${wasmFn} not found in pkg`);
    }
  }

  for (const id of [...apiCases].sort()) {
    if (id === 'precision') continue;
    if (!algorithms.find((a) => a.id === id) && !['precision'].includes(id)) {
      dispatchIssues.push(`${id}: api.ts case not in kernel registry`);
    }
  }

  console.log(`Registry algorithms: ${algorithms.length}`);
  console.log(`api.ts cases: ${apiCases.size}`);
  console.log(`handlers.ts cases: ${handlerCases.size}`);
  console.log(`WASM exports: ${wasmExports.size}`);
  if (dispatchIssues.length > 0) {
    console.log(`\n[WARN] ${dispatchIssues.length} dispatch issue(s):`);
    for (const issue of dispatchIssues.slice(0, 20)) {
      console.log(`  - ${issue}`);
    }
    if (dispatchIssues.length > 20) {
      console.log(`  ... +${dispatchIssues.length - 20} more`);
    }
  } else {
    console.log('[PASS] Static dispatch parity clean');
  }

  console.log(`\n--- Real-boundary algorithm sweep (v${version}) ---`);
  const ctx = await initBoundary();

  const KNOWN_EXTRA_API_CASES = new Set([
    'petri_net_reduction',
    'compute_simplicity',
    'automl_regress',
    'precision',
  ]);
  const blockingDispatchIssues = dispatchIssues.filter(
    (issue) => !KNOWN_EXTRA_API_CASES.has(issue.split(':')[0])
  );

  const report = {
    package: 'wasm4pm',
    version,
    git_commit: gitCommit,
    generated_at: new Date().toISOString(),
    algorithm_count: algorithms.length,
    dispatch_issues: dispatchIssues,
    summary: {
      positive_passed: 0,
      positive_failed: 0,
      negative_passed: 0,
      negative_failed: 0,
      invariant_passed: 0,
      invariant_failed: 0,
    },
    algorithms: [] as Array<Record<string, unknown>>,
  };

  try {
    for (const algo of algorithms) {
      const row: Record<string, unknown> = {
        algorithm_id: algo.id,
        category: algo.category,
        positive: { status: 'pending' as string },
        negative_empty: { status: 'pending' as string, expected: 'EMPTY_EVENT_LOG' },
        negative_malformed: { status: 'pending' as string, expected: 'MALFORMED_EVENT_LOG' },
        invariant: { status: 'pending' as string },
      };

      process.stdout.write(`[SWEEP] ${algo.id} ... `);

      try {
        const pos = await runAlgorithmPositive(ctx, algo.id);
        row.positive = { status: 'passed', result_hash: pos.result_hash, duration_ms: pos.duration_ms };
        report.summary.positive_passed++;
      } catch (err) {
        row.positive = {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          code: classifyError(err, algo.id),
        };
        report.summary.positive_failed++;
      }

      const empty = await runAlgorithmNegative(ctx, algo.id, fixtures.invalid.emptyLog.toString('utf-8'));
      const emptyOk = empty.error_code === 'EMPTY_EVENT_LOG';
      row.negative_empty = {
        status: emptyOk ? 'failed_correctly' : 'failed_incorrectly',
        error_code: empty.error_code,
        no_panic: empty.no_panic,
      };
      if (emptyOk) report.summary.negative_passed++;
      else report.summary.negative_failed++;

      const malformedInput = fixtures.invalid.malformed.toString('utf-8');
      const malformed = await runAlgorithmNegative(ctx, algo.id, malformedInput);
      const expectedMalformed =
        algo.id.startsWith('ml_') || algo.id.startsWith('predict_')
          ? 'PREDICTION_FEATURES_REQUIRED'
          : 'MALFORMED_EVENT_LOG';
      const malformedOk = malformed.error_code === expectedMalformed;
      row.negative_malformed = {
        status: malformedOk ? 'failed_correctly' : 'failed_incorrectly',
        error_code: malformed.error_code,
        expected: expectedMalformed,
        no_panic: malformed.no_panic,
      };
      if (malformedOk) report.summary.negative_passed++;
      else report.summary.negative_failed++;

      try {
        const inv = await runAlgorithmInvariant(ctx, algo.id);
        const invOk = inv.stable;
        row.invariant = {
          status: invOk ? 'passed' : 'failed',
          stable: inv.stable,
          first_result_hash: inv.first_hash,
          second_result_hash: inv.second_hash,
          stochastic: isStochasticAlgorithm(algo.id),
        };
        if (invOk) report.summary.invariant_passed++;
        else report.summary.invariant_failed++;
      } catch (err) {
        row.invariant = {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
        report.summary.invariant_failed++;
      }

      const posOk = (row.positive as { status: string }).status === 'passed';
      const negOk =
        (row.negative_empty as { status: string }).status === 'failed_correctly' &&
        (row.negative_malformed as { status: string }).status === 'failed_correctly';
      const invOk = (row.invariant as { status: string }).status === 'passed';
      console.log(posOk && negOk && invOk ? 'PASS' : 'FAIL');

      report.algorithms.push(row);
    }
  } finally {
    ctx.cleanup();
  }

  const outDir = path.resolve(process.cwd(), 'artifacts/release');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ALGORITHM_SWEEP_REPORT.v${version}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n--- Sweep summary ---');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${outPath}`);

  const failed =
    report.summary.positive_failed +
    report.summary.negative_failed +
    report.summary.invariant_failed;
  if (failed > 0 || blockingDispatchIssues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Example — AutoMembrane: Built-in Attack Benchmarks
 *
 * Demonstrates: `get_builtin_benchmarks()`, `run_benchmark_trace()`, `run_all_benchmarks()`
 * Docs reference: WASM_API.md § AutoMembrane — Built-in Benchmarks
 *
 * AutoMembrane classifies process-mining motions (actor+action+object tuples) against
 * a stateless heuristic policy layer. The eight built-in traces encode canonical attack
 * patterns from the Van der Aalst taxonomy + MITRE ATT&CK (T1195, T1105):
 *   - Custody bypass (approval without evidence)
 *   - Privilege escalation (self-approval of own submissions)
 *   - Temporal replay attack (reusing a stale approval)
 *   - Supply chain self-approval
 *
 * Contract: all 8 built-in adversarial traces MUST produce non-Allow final verdicts.
 * An Allow verdict on any adversarial trace is a regression in the membrane.
 */
import assert from 'node:assert/strict';
import * as core from '@wasm4pm/core';
import { logger } from '../utils/logger.js';

interface BenchmarkTrace {
  trace_id: string;
  name: string;
  description: string;
  attack_type: string;
  events: unknown[];
  expected_final_verdict: string;
  pass_condition: string;
}

async function main(): Promise<void> {
  logger.header('🛡️', 'AutoMembrane Built-in Attack Benchmarks', '8 adversarial traces — all must be non-Allow');

  // Initialize the WASM module
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }

  // ── Step 1: Enumerate the 8 built-in benchmark definitions ──────────────────
  logger.step(1, 3, 'Loading built-in benchmark definitions');
  const benchmarksRaw = (core as any).get_builtin_benchmarks();
  const benchmarks: BenchmarkTrace[] = JSON.parse(
    typeof benchmarksRaw === 'string' ? benchmarksRaw : JSON.stringify(benchmarksRaw)
  );

  assert.strictEqual(benchmarks.length, 8, `Expected 8 built-in benchmarks, got ${benchmarks.length}`);
  logger.success(`Loaded ${benchmarks.length} benchmark traces`);

  for (const b of benchmarks) {
    logger.info(`  [${b.trace_id}] ${b.name} — attack: ${b.attack_type}`);
    logger.info(`         expected final verdict: ${b.expected_final_verdict}`);
  }

  // ── Step 2: Run a single trace via run_benchmark_trace() ────────────────────
  logger.step(2, 3, 'Running single trace via run_benchmark_trace()');
  const singleTraceJson = JSON.stringify(benchmarks[0]);
  const singleResultRaw = (core as any).run_benchmark_trace(singleTraceJson);
  const singleResult = JSON.parse(
    typeof singleResultRaw === 'string' ? singleResultRaw : JSON.stringify(singleResultRaw)
  );

  assert.ok(singleResult.trace_id, 'Single benchmark result missing trace_id');
  assert.ok(typeof singleResult.pass === 'boolean', 'Single benchmark result missing pass field');
  const allowVerdicts = new Set(['allow', 'allowwithreceipt']);
  assert.ok(
    !allowVerdicts.has(singleResult.final_verdict.toLowerCase()),
    `MEMBRANE REGRESSION: adversarial trace [${singleResult.trace_id}] got Allow verdict — expected denial`
  );
  logger.success(`Single trace [${singleResult.trace_id}] — pass:${singleResult.pass}, final_verdict:${singleResult.final_verdict}`);

  // ── Step 3: Run all 8 traces via run_all_benchmarks() ───────────────────────
  logger.step(3, 3, 'Running all 8 benchmarks via run_all_benchmarks()');
  const allResultRaw = (core as any).run_all_benchmarks();
  const allResult = JSON.parse(
    typeof allResultRaw === 'string' ? allResultRaw : JSON.stringify(allResultRaw)
  );

  assert.strictEqual(allResult.total, 8, `Expected 8 total results, got ${allResult.total}`);

  const regressions: string[] = [];
  for (const result of allResult.results) {
    const icon = result.pass ? '✅' : '❌';
    logger.info(`  ${icon} [${result.trace_id}] ${result.name} — verdict:${result.final_verdict}`);
    if (!result.pass) regressions.push(result.trace_id);
    if (allowVerdicts.has(result.final_verdict.toLowerCase())) {
      regressions.push(`${result.trace_id}:ALLOW_REGRESSION`);
    }
  }

  assert.strictEqual(regressions.length, 0,
    `MEMBRANE REGRESSIONS: ${regressions.join(', ')} — adversarial traces were not denied`);
  assert.strictEqual(allResult.passed, 8, `Expected all 8 to pass, got ${allResult.passed}/8`);

  logger.success(`All ${allResult.total} benchmarks passed (pass_rate: ${(allResult.pass_rate * 100).toFixed(1)}%)`);
  logger.info('✅ AutoMembrane attack benchmark witness complete.');
}

main().catch(err => {
  console.error('AutoMembrane benchmark failed:', err);
  process.exit(1);
});

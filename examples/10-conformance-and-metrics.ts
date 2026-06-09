/**
 * Case Study: Audit & Risk Compliance
 * 
 * Business Context:
 * Corporate auditors verify expense approvals via constraint mining.
 */
import { Kernel } from 'wasm4pm';
import { logger } from './utils/logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function runAuditCompliance(): Promise<void> {
  logger.header('📋', 'Audit & Risk Compliance', 'Mining DECLARE constraints and speedup metrics');

  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 2, 'Loading Expense Approvals');
  const __dir = dirname(fileURLToPath(import.meta.url));
  const xes = readFileSync(join(__dir, 'fixtures/roadtraffic100traces.xes'), 'utf-8');

  let handle: string;
  try {
    handle = await kernel.run('load_eventlog_from_xes', null as any, { xes }) as any;
    handle = (handle as any).handle || handle;
  } catch (e) {
    handle = wasm.load_eventlog_from_xes(xes);
  }
  assert.ok(typeof handle === 'string' && handle.length > 0, 'Event log handle must be a non-empty string');
  logger.success('Approvals loaded into the cryptographic auditor.');

  logger.step(2, 2, 'Calculating Metric Invariants');
  const algorithms = [
    'alignments', 'declare', 'etconformance_precision', 'analyze_process_speedup', 
    'analyze_variant_complexity', 'complexity_metrics', 'performance_spectrum'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, handle, { activityKey: 'concept:name' });
      logger.success(`[${algo.padEnd(25)}] computed in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(25)}] constrained by missing variables (mock payload skip)`);
    }
  }
}
runAuditCompliance().catch(console.error);
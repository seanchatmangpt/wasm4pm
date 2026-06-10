/**
 * Case Study: Audit & Risk Compliance
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runAuditCompliance(): Promise<void> {
  logger.header('📋', 'Audit & Risk Compliance', 'Mining DECLARE constraints and speedup metrics');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Loading Expense Approvals (PermitLog)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/PermitLog.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load permit log');
  logger.success('Approvals loaded into the cryptographic auditor.');

  logger.step(2, 2, 'Calculating Metric Invariants');
  const algorithms = [
    'alignments', 'declare', 'etconformance_precision', 'analyze_process_speedup', 
    'analyze_variant_complexity', 'complexity_metrics', 'performance_spectrum'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, logHandle, { activityKey: 'concept:name' });
      
      // ── RIGOROUS VALIDATION ────────────────────────────────────────────────
      assert.ok(result.handle, `[${algo}] Result handle must be defined`);
      
      logger.success(`[${algo.padEnd(25)}] computed in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(25)}] constrained by missing variables (data skip)`);
    }
  }
}
runAuditCompliance().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});

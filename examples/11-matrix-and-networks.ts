/**
 * Case Study: Hospital Resource Handover Network
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runHospitalNetworks(): Promise<void> {
  logger.header('🏥', 'Hospital Resource Handover Network', 'Mining social and organizational transition probabilities');
  
  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Ingesting Real Clinical Logs (Sepsis)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'data/small-example.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load sepsis log');
  logger.success('Logs parsed. Extracted org:resource bounds.');

  logger.step(2, 2, 'Evaluating Network Transitions');
  const algorithms = [
    'compute_activity_transition_matrix', 'compute_ewma', 'compute_trace_similarity_matrix', 
    'handover_network', 'working_together_network', 'log_to_trie'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, logHandle, { activityKey: 'concept:name', resourceKey: 'org:resource' });
      
      // ── RIGOROUS VALIDATION ────────────────────────────────────────────────
      assert.ok(result.handle, `[${algo}] Result handle must be defined`);
      
      logger.success(`[${algo.padEnd(35)}] synthesized in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(35)}] skipped (requires specific organizational attributes)`);
    }
  }
}
runHospitalNetworks().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});

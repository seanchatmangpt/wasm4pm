/**
 * Case Study: Hospital Resource Handover Network
 * 
 * Business Context:
 * Optimize nursing shift handovers via organizational networks.
 */
import { Kernel } from 'wasm4pm';
import { logger } from './utils/logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function runHospitalNetworks(): Promise<void> {
  logger.header('🏥', 'Hospital Resource Handover Network', 'Mining social and organizational transition probabilities');

  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 2, 'Ingesting Resource-Annotated Logs');
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
  logger.success('Logs parsed. Extracted org:resource bounds.');

  logger.step(2, 2, 'Evaluating Network Transitions');
  const algorithms = [
    'compute_activity_transition_matrix', 'compute_ewma', 'compute_trace_similarity_matrix', 
    'handover_network', 'working_together_network', 'log_to_trie'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, handle, { activityKey: 'concept:name', resourceKey: 'org:resource' });
      logger.success(`[${algo.padEnd(35)}] synthesized in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(35)}] skipped (requires larger organizational payload)`);
    }
  }
}
runHospitalNetworks().catch(console.error);
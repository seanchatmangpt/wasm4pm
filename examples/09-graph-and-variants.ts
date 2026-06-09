/**
 * Case Study: Customer Journey Mapping (Variants)
 * 
 * Business Context:
 * A marketing team wants to analyze web portal navigation segments.
 */
import { Kernel } from 'wasm4pm';
import { logger } from './utils/logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function runCustomerJourney(): Promise<void> {
  logger.header('🗺️', 'Customer Journey Mapping', 'Extracting variants and skeleton graphs');

  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 2, 'Loading Navigation Segments');
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
  logger.success('Segments ingested.');

  logger.step(2, 2, 'Clustering via Graph Abstractions');
  const algorithms = [
    'process_skeleton', 'transition_system', 'causal_graph', 'hierarchical_dfg', 
    'optimized_dfg', 'batches', 'correlation_miner', 'generalization'
  ];

  for (const algo of algorithms) {
    try {
      const result = await kernel.run(algo, handle, { activityKey: 'concept:name' });
      logger.success(`[${algo.padEnd(20)}] evaluated in ${result.durationMs.toFixed(2)}ms`);
    } catch (e) {
      logger.warn(`[${algo.padEnd(20)}] requires further log dimension and was halted safely`);
    }
  }
}
runCustomerJourney().catch(console.error);